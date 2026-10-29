import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import type { ActivityDoc, MemberDoc, SubmissionDoc, UserDoc } from '@classinteract/shared';
import {
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  POST_TYPE_LABELS,
  QUESTION_STATUS_LABELS,
  ROLE_LABELS,
  SESSION_STATUS_LABELS,
  formatPercent,
} from '@classinteract/shared';
import { z } from 'zod';
import { db } from '../firebase';
import { requireClassModerator } from '../lib/access';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import {
  aggregateTopics,
  loadClassPosts,
  loadClassStats,
  loadSessionActivities,
  loadSessionsWithStats,
  loadStudents,
  studentRows,
  topicsByStudent,
} from '../lib/classData';
import { parse } from '../lib/errors';
import { C } from '../lib/paths';
import { toMillis } from '../lib/time';

type Cell = string | number | null;
interface Sheet {
  key: string;
  name: string;
  columns: { header: string; width?: number }[];
  rows: Cell[][];
}

const DATASETS = ['students', 'sessions', 'questions', 'answers', 'topics', 'activities', 'submissions'] as const;

const fmtTime = (v: unknown) => {
  const ms = toMillis(v);
  if (!ms) return '';
  return new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};
const pct = (r: number | null) => (r === null ? '' : formatPercent(r, 1));

async function buildSheets(classId: string, revealAnonymous: boolean): Promise<Sheet[]> {
  const [stats, sessions, students, posts] = await Promise.all([
    loadClassStats(classId),
    loadSessionsWithStats(classId),
    loadStudents(classId),
    loadClassPosts(classId),
  ]);
  const sessionLabel = new Map(sessions.map((s) => [s.sessionId, `Buổi ${String(s.sessionNumber).padStart(2, '0')}`]));
  const members = new Map<string, MemberDoc>(students.map((s) => [s.member.uid, s.member]));
  // Names of non-members (lecturers, admins) for authorship
  const otherUids = [...new Set(posts.map((p) => p.authorUid).filter((u): u is string => !!u && !members.has(u)))];
  const others = otherUids.length ? await db.getAll(...otherUids.map((u) => C.user(u))) : [];
  const userName = new Map(others.filter((o) => o.exists).map((o) => [o.id, (o.data() as UserDoc).displayName]));

  const authorCols = (p: (typeof posts)[number]) => {
    if (p.isAiGenerated) return ['AI (đã duyệt)', ''];
    if (p.isAnonymous && !(revealAnonymous && p.identityRevealable)) return ['Ẩn danh', ''];
    const m = p.authorUid ? members.get(p.authorUid) : undefined;
    if (m) return [m.displayName + (p.isAnonymous ? ' (ẩn danh)' : ''), m.studentId ?? ''];
    return [p.authorUid ? (userName.get(p.authorUid) ?? p.authorName) : p.authorName, ''];
  };

  const rows = studentRows(students, stats, topicsByStudent(posts));
  const sheets: Sheet[] = [];
  sheets.push({
    key: 'students',
    name: 'Student Participation',
    columns: [
      { header: 'STT', width: 6 },
      { header: 'Mã SV', width: 14 },
      { header: 'Họ tên', width: 28 },
      { header: 'Vai trò lớp' },
      { header: 'Số buổi tham gia' },
      { header: 'Tỷ lệ tham dự' },
      { header: 'Câu hỏi' },
      { header: 'Trả lời' },
      { header: 'Bình luận' },
      { header: 'Nhận xét' },
      { header: 'Phản hồi nhanh' },
      { header: 'Hoạt động hoàn thành' },
      { header: 'Tỷ lệ hoàn thành HĐ' },
      { header: 'Khảo sát' },
      { header: 'Quiz' },
      { header: 'Quiz đúng' },
      { header: 'Độ chính xác quiz' },
      { header: 'Câu trả lời được xác nhận' },
      { header: 'Câu hỏi chưa giải đáp' },
      { header: 'Số chủ đề tham gia' },
      { header: 'Mức độ đều đặn' },
      { header: 'Tổng tương tác' },
      { header: 'Hoạt động gần nhất', width: 20 },
    ],
    rows: rows.map((r, i) => [
      i + 1,
      r.studentId,
      r.displayName,
      r.memberRole === 'ta' ? 'Trợ giảng' : 'Sinh viên',
      r.sessionsJoined,
      pct(r.attendanceRate),
      r.questions,
      r.answers,
      r.comments,
      r.reflections,
      r.reactions,
      r.activitiesCompleted,
      pct(r.activityCompletionRate),
      r.pollsAnswered,
      r.quizzesAnswered,
      r.quizCorrect,
      pct(r.quizAccuracy),
      r.acceptedAnswers,
      r.openQuestions,
      r.topicsCovered,
      pct(r.consistency),
      r.interactions,
      fmtTime(r.lastActiveAt),
    ]),
  });

  sheets.push({
    key: 'sessions',
    name: 'Session Statistics',
    columns: [
      { header: 'Buổi' },
      { header: 'Tên buổi học', width: 36 },
      { header: 'Ngày' },
      { header: 'Trạng thái' },
      { header: 'SV tham gia' },
      { header: 'SV có tương tác' },
      { header: 'Câu hỏi' },
      { header: 'Trả lời' },
      { header: 'Bình luận' },
      { header: 'Nhận xét' },
      { header: 'Câu hỏi chưa giải đáp' },
      { header: 'Hoạt động' },
      { header: 'Bài nộp' },
      { header: 'Phản hồi nhanh' },
    ],
    rows: sessions.map((s) => [
      s.sessionNumber,
      s.title,
      s.date,
      SESSION_STATUS_LABELS[s.status],
      s.stats?.attendeeCount ?? 0,
      s.stats?.interactedCount ?? 0,
      s.stats?.questionCount ?? 0,
      s.stats?.answerCount ?? 0,
      s.stats?.commentCount ?? 0,
      s.stats?.reflectionCount ?? 0,
      s.stats?.openQuestionCount ?? 0,
      s.stats?.activityCount ?? 0,
      s.stats?.submissionCount ?? 0,
      s.stats?.reactionCount ?? 0,
    ]),
  });

  const roots = posts.filter((p) => p.isRoot).sort((a, b) => (toMillis(a.createdAt) ?? 0) - (toMillis(b.createdAt) ?? 0));
  const rootById = new Map(roots.map((r) => [r.postId, r]));
  sheets.push({
    key: 'questions',
    name: 'Questions',
    columns: [
      { header: 'Buổi' },
      { header: 'Thời gian', width: 20 },
      { header: 'Loại' },
      { header: 'Người gửi', width: 26 },
      { header: 'Mã SV', width: 14 },
      { header: 'Nội dung', width: 60 },
      { header: 'Chủ đề', width: 24 },
      { header: 'Trạng thái' },
      { header: 'Số phản hồi' },
      { header: 'Bình chọn' },
      { header: 'Hiển thị' },
    ],
    rows: roots.map((p) => [
      sessionLabel.get(p.sessionId) ?? '',
      fmtTime(p.createdAt),
      POST_TYPE_LABELS[p.type],
      ...authorCols(p),
      p.content,
      (p.topics ?? []).join(', '),
      p.status ? QUESTION_STATUS_LABELS[p.status] : '',
      p.replyCount,
      p.voteCount,
      p.moderationStatus === 'visible' ? 'Có' : 'Đã ẩn',
    ]),
  });

  const replies = posts.filter((p) => !p.isRoot).sort((a, b) => (toMillis(a.createdAt) ?? 0) - (toMillis(b.createdAt) ?? 0));
  sheets.push({
    key: 'answers',
    name: 'Answers',
    columns: [
      { header: 'Buổi' },
      { header: 'Thời gian', width: 20 },
      { header: 'Câu hỏi gốc', width: 40 },
      { header: 'Loại' },
      { header: 'Người trả lời', width: 26 },
      { header: 'Mã SV', width: 14 },
      { header: 'Vai trò' },
      { header: 'Nội dung', width: 60 },
      { header: 'GV xác nhận' },
      { header: 'Do AI tạo' },
      { header: 'Hiển thị' },
    ],
    rows: replies.map((p) => [
      sessionLabel.get(p.sessionId) ?? '',
      fmtTime(p.createdAt),
      (rootById.get(p.rootPostId ?? '')?.content ?? '').slice(0, 200),
      POST_TYPE_LABELS[p.type],
      ...authorCols(p),
      p.authorRole === 'ai' ? 'AI' : p.authorRole === 'ta' ? 'Trợ giảng' : (ROLE_LABELS as Record<string, string>)[p.authorRole] ?? p.authorRole,
      p.content,
      p.isAccepted ? 'Có' : '',
      p.isAiGenerated ? 'Có' : '',
      p.moderationStatus === 'visible' ? 'Có' : 'Đã ẩn',
    ]),
  });

  sheets.push({
    key: 'topics',
    name: 'Topics',
    columns: [
      { header: 'Chủ đề', width: 32 },
      { header: 'Câu hỏi' },
      { header: 'Trả lời' },
      { header: 'Bình luận/Nhận xét' },
      { header: 'Chưa giải đáp' },
      { header: 'SV tham gia' },
      { header: 'Số buổi xuất hiện' },
    ],
    rows: aggregateTopics(posts).map((t) => [t.topic, t.questions, t.answers, t.comments, t.openQuestions, t.participants, t.sessions]),
  });

  const actRows: Cell[][] = [];
  const subRows: Cell[][] = [];
  for (const s of sessions) {
    const acts = await loadSessionActivities(classId, s.sessionId);
    for (const act of acts as (ActivityDoc & { results: Record<string, unknown> | null })[]) {
      const r = (act.results ?? {}) as { submissionCount?: number; optionCounts?: Record<string, number>; correctCount?: number };
      const optionSummary = act.options.map((o) => `${o.label}: ${r.optionCounts?.[o.id] ?? 0}`).join(' | ');
      actRows.push([
        sessionLabel.get(s.sessionId) ?? '',
        act.title,
        ACTIVITY_TYPE_LABELS[act.type],
        ACTIVITY_STATUS_LABELS[act.status],
        r.submissionCount ?? 0,
        act.type === 'quiz' && r.submissionCount ? pct((r.correctCount ?? 0) / r.submissionCount) : '',
        optionSummary,
      ]);
      const [subs, grades] = await Promise.all([
        C.submissions(classId, s.sessionId, act.activityId).get(),
        act.type === 'quiz' ? C.grading(classId, s.sessionId, act.activityId).get() : null,
      ]);
      const correct = new Map(grades?.docs.map((g) => [g.id, !!g.data().isCorrect]) ?? []);
      const labels = new Map(act.options.map((o) => [o.id, o.label]));
      for (const d of subs.docs) {
        const sub = d.data() as SubmissionDoc;
        subRows.push([
          sessionLabel.get(s.sessionId) ?? '',
          act.title,
          sub.studentId,
          sub.displayName,
          sub.optionIds.map((o) => labels.get(o) ?? o).join(', '),
          sub.text,
          act.type === 'quiz' ? (correct.get(d.id) ? 'Đúng' : 'Sai') : '',
          fmtTime(sub.updatedAt),
        ]);
      }
    }
  }
  sheets.push({
    key: 'activities',
    name: 'Activities',
    columns: [
      { header: 'Buổi' },
      { header: 'Hoạt động', width: 36 },
      { header: 'Loại' },
      { header: 'Trạng thái' },
      { header: 'Số bài nộp' },
      { header: 'Tỷ lệ đúng' },
      { header: 'Kết quả theo phương án', width: 60 },
    ],
    rows: actRows,
  });
  sheets.push({
    key: 'submissions',
    name: 'Activity Submissions',
    columns: [
      { header: 'Buổi' },
      { header: 'Hoạt động', width: 30 },
      { header: 'Mã SV', width: 14 },
      { header: 'Họ tên', width: 26 },
      { header: 'Lựa chọn', width: 30 },
      { header: 'Nội dung trả lời', width: 60 },
      { header: 'Kết quả' },
      { header: 'Thời gian', width: 20 },
    ],
    rows: subRows,
  });
  return sheets;
}

const csvCell = (v: Cell) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const xlsxSafe = (v: Cell) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

export default async function exportRoutes(app: FastifyInstance) {
  app.get('/classes/:classId/export', async (req, reply) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    const a = await requireClassModerator(me, classId);
    const q = parse(
      z.object({ format: z.enum(['xlsx', 'csv', 'json']).default('xlsx'), dataset: z.enum(DATASETS).default('students') }),
      req.query,
    );
    const sheets = await buildSheets(classId, a.cls.settings.revealAnonymousToStaff);
    const base = `${a.cls.classCode}_${a.cls.semester}`.replace(/[^A-Za-z0-9._-]+/g, '_');
    await audit(req, 'class.export', 'class', classId, { format: q.format, dataset: q.format === 'xlsx' ? 'all' : q.dataset });

    if (q.format === 'json') {
      return {
        class: { classId, classCode: a.cls.classCode, name: a.cls.name, semester: a.cls.semester },
        generatedAt: new Date().toISOString(),
        sheets: sheets.map((s) => ({
          key: s.key,
          name: s.name,
          rows: s.rows.map((r) => Object.fromEntries(s.columns.map((c, i) => [c.header, r[i] ?? null]))),
        })),
      };
    }
    if (q.format === 'csv') {
      const sheet = sheets.find((s) => s.key === q.dataset)!;
      const csv = [sheet.columns.map((c) => csvCell(c.header)).join(','), ...sheet.rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${base}_${sheet.key}.csv"`)
        .send('﻿' + csv);
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ClassInteract AI';
    wb.created = new Date();
    for (const s of sheets) {
      const ws = wb.addWorksheet(s.name);
      ws.columns = s.columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 2) }));
      s.rows.forEach((r) => ws.addRow(r.map(xlsxSafe)));
      const header = ws.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      if (s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
    }
    const buf = await wb.xlsx.writeBuffer();
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${base}_ClassInteract.xlsx"`)
      .send(Buffer.from(buf as ArrayBuffer));
  });
}
