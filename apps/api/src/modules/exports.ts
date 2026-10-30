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
  translate,
  type Lang,
  type Params,
} from '@classinteract/shared';
import { z } from 'zod';
import { db } from '../firebase';
import { requireClassModerator } from '../lib/access';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import {
  UNTAGGED,
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
import { requestLang } from '../lib/lang';
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

const fmtTime = (v: unknown, lang: Lang = 'vi') => {
  const ms = toMillis(v);
  if (!ms) return '';
  return new Date(ms).toLocaleString(lang === 'en' ? 'en-GB' : 'vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};
const pct = (r: number | null) => (r === null ? '' : formatPercent(r, 1));

async function buildSheets(classId: string, revealAnonymous: boolean, lang: Lang): Promise<Sheet[]> {
  const T = (text: string, params?: Params) => translate(lang, text, params);
  const [stats, sessions, students, posts] = await Promise.all([
    loadClassStats(classId),
    loadSessionsWithStats(classId),
    loadStudents(classId),
    loadClassPosts(classId),
  ]);
  const sessionLabel = new Map(sessions.map((s) => [s.sessionId, T('Buổi {{n}}', { n: String(s.sessionNumber).padStart(2, '0') })]));
  const members = new Map<string, MemberDoc>(students.map((s) => [s.member.uid, s.member]));
  // Names of non-members (lecturers, admins) for authorship
  const otherUids = [...new Set(posts.map((p) => p.authorUid).filter((u): u is string => !!u && !members.has(u)))];
  const others = otherUids.length ? await db.getAll(...otherUids.map((u) => C.user(u))) : [];
  const userName = new Map(others.filter((o) => o.exists).map((o) => [o.id, (o.data() as UserDoc).displayName]));

  const authorCols = (p: (typeof posts)[number]) => {
    if (p.isAiGenerated) return [T('AI (đã duyệt)'), ''];
    if (p.isAnonymous && !(revealAnonymous && p.identityRevealable)) return [T('Ẩn danh'), ''];
    const m = p.authorUid ? members.get(p.authorUid) : undefined;
    if (m) return [m.displayName + (p.isAnonymous ? T(' (ẩn danh)') : ''), m.studentId ?? ''];
    return [p.authorUid ? (userName.get(p.authorUid) ?? p.authorName) : p.authorName, ''];
  };

  const rows = studentRows(students, stats, topicsByStudent(posts));
  const sheets: Sheet[] = [];
  sheets.push({
    key: 'students',
    name: 'Student Participation',
    columns: [
      { header: T('STT'), width: 6 },
      { header: T('Mã SV'), width: 14 },
      { header: T('Họ tên'), width: 28 },
      { header: T('Vai trò lớp') },
      { header: T('Số buổi tham gia') },
      { header: T('Tỷ lệ tham dự') },
      { header: T('Câu hỏi') },
      { header: T('Trả lời') },
      { header: T('Bình luận') },
      { header: T('Nhận xét') },
      { header: T('Phản hồi nhanh') },
      { header: T('Hoạt động hoàn thành') },
      { header: T('Tỷ lệ hoàn thành HĐ') },
      { header: T('Khảo sát') },
      { header: T('Quiz') },
      { header: T('Quiz đúng') },
      { header: T('Độ chính xác quiz') },
      { header: T('Câu trả lời được xác nhận') },
      { header: T('Câu hỏi chưa giải đáp') },
      { header: T('Số chủ đề tham gia') },
      { header: T('Mức độ đều đặn') },
      { header: T('Tổng tương tác') },
      { header: T('Hoạt động gần nhất'), width: 20 },
    ],
    rows: rows.map((r, i) => [
      i + 1,
      r.studentId,
      r.displayName,
      r.memberRole === 'ta' ? T('Trợ giảng') : T('Sinh viên'),
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
      fmtTime(r.lastActiveAt, lang),
    ]),
  });

  sheets.push({
    key: 'sessions',
    name: 'Session Statistics',
    columns: [
      { header: T('Buổi') },
      { header: T('Tên buổi học'), width: 36 },
      { header: T('Ngày') },
      { header: T('Trạng thái') },
      { header: T('SV tham gia') },
      { header: T('SV có tương tác') },
      { header: T('Câu hỏi') },
      { header: T('Trả lời') },
      { header: T('Bình luận') },
      { header: T('Nhận xét') },
      { header: T('Câu hỏi chưa giải đáp') },
      { header: T('Hoạt động') },
      { header: T('Bài nộp') },
      { header: T('Phản hồi nhanh') },
    ],
    rows: sessions.map((s) => [
      s.sessionNumber,
      s.title,
      s.date,
      T(SESSION_STATUS_LABELS[s.status]),
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
      { header: T('Buổi') },
      { header: T('Thời gian'), width: 20 },
      { header: T('Loại') },
      { header: T('Người gửi'), width: 26 },
      { header: T('Mã SV'), width: 14 },
      { header: T('Nội dung'), width: 60 },
      { header: T('Chủ đề'), width: 24 },
      { header: T('Trạng thái') },
      { header: T('Số phản hồi') },
      { header: T('Bình chọn') },
      { header: T('Hiển thị') },
    ],
    rows: roots.map((p) => [
      sessionLabel.get(p.sessionId) ?? '',
      fmtTime(p.createdAt, lang),
      T(POST_TYPE_LABELS[p.type]),
      ...authorCols(p),
      p.content,
      (p.topics ?? []).join(', '),
      p.status ? T(QUESTION_STATUS_LABELS[p.status]) : '',
      p.replyCount,
      p.voteCount,
      p.moderationStatus === 'visible' ? T('Có') : T('Đã ẩn'),
    ]),
  });

  const replies = posts.filter((p) => !p.isRoot).sort((a, b) => (toMillis(a.createdAt) ?? 0) - (toMillis(b.createdAt) ?? 0));
  sheets.push({
    key: 'answers',
    name: 'Answers',
    columns: [
      { header: T('Buổi') },
      { header: T('Thời gian'), width: 20 },
      { header: T('Câu hỏi gốc'), width: 40 },
      { header: T('Loại') },
      { header: T('Người trả lời'), width: 26 },
      { header: T('Mã SV'), width: 14 },
      { header: T('Vai trò') },
      { header: T('Nội dung'), width: 60 },
      { header: T('GV xác nhận') },
      { header: T('Do AI tạo') },
      { header: T('Hiển thị') },
    ],
    rows: replies.map((p) => [
      sessionLabel.get(p.sessionId) ?? '',
      fmtTime(p.createdAt, lang),
      (rootById.get(p.rootPostId ?? '')?.content ?? '').slice(0, 200),
      T(POST_TYPE_LABELS[p.type]),
      ...authorCols(p),
      p.authorRole === 'ai' ? 'AI' : p.authorRole === 'ta' ? T('Trợ giảng') : T((ROLE_LABELS as Record<string, string>)[p.authorRole] ?? p.authorRole),
      p.content,
      p.isAccepted ? T('Có') : '',
      p.isAiGenerated ? T('Có') : '',
      p.moderationStatus === 'visible' ? T('Có') : T('Đã ẩn'),
    ]),
  });

  sheets.push({
    key: 'topics',
    name: 'Topics',
    columns: [
      { header: T('Chủ đề'), width: 32 },
      { header: T('Câu hỏi') },
      { header: T('Trả lời') },
      { header: T('Bình luận/Nhận xét') },
      { header: T('Chưa giải đáp') },
      { header: T('SV tham gia') },
      { header: T('Số buổi xuất hiện') },
    ],
    rows: aggregateTopics(posts).map((t) => [t.topic === UNTAGGED ? T(UNTAGGED) : t.topic, t.questions, t.answers, t.comments, t.openQuestions, t.participants, t.sessions]),
  });

  const actRows: Cell[][] = [];
  const subRows: Cell[][] = [];
  for (const s of sessions) {
    const acts = await loadSessionActivities(classId, s.sessionId);
    for (const act of acts as (ActivityDoc & { results: Record<string, unknown> | null })[]) {
      const r = (act.results ?? {}) as { submissionCount?: number; optionCounts?: Record<string, number>; correctCount?: number };
      const optionSummary = act.options.map((o) => `${act.type === 'understanding' ? T(o.label) : o.label}: ${r.optionCounts?.[o.id] ?? 0}`).join(' | ');
      actRows.push([
        sessionLabel.get(s.sessionId) ?? '',
        act.title,
        T(ACTIVITY_TYPE_LABELS[act.type]),
        T(ACTIVITY_STATUS_LABELS[act.status]),
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
          sub.optionIds.map((o) => (act.type === 'understanding' ? T(labels.get(o) ?? o) : (labels.get(o) ?? o))).join(', '),
          sub.text,
          act.type === 'quiz' ? (correct.get(d.id) ? T('Đúng') : T('Sai')) : '',
          fmtTime(sub.updatedAt, lang),
        ]);
      }
    }
  }
  sheets.push({
    key: 'activities',
    name: 'Activities',
    columns: [
      { header: T('Buổi') },
      { header: T('Hoạt động'), width: 36 },
      { header: T('Loại') },
      { header: T('Trạng thái') },
      { header: T('Số bài nộp') },
      { header: T('Tỷ lệ đúng') },
      { header: T('Kết quả theo phương án'), width: 60 },
    ],
    rows: actRows,
  });
  sheets.push({
    key: 'submissions',
    name: 'Activity Submissions',
    columns: [
      { header: T('Buổi') },
      { header: T('Hoạt động'), width: 30 },
      { header: T('Mã SV'), width: 14 },
      { header: T('Họ tên'), width: 26 },
      { header: T('Lựa chọn'), width: 30 },
      { header: T('Nội dung trả lời'), width: 60 },
      { header: T('Kết quả') },
      { header: T('Thời gian'), width: 20 },
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
    const sheets = await buildSheets(classId, a.cls.settings.revealAnonymousToStaff, requestLang(req));
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
