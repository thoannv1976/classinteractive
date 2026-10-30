import { collection, limit, orderBy, query } from 'firebase/firestore';
import { ChevronLeft, Printer } from 'lucide-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from 'recharts';
import type {
  ActivityDoc,
  ActivityResultsDoc,
  AttendanceDoc,
  ClassDoc,
  ClassStatsDoc,
  PostDoc,
  SessionDoc,
  SessionStatsDoc,
  SessionStatus,
  SessionSummaryDoc,
  SessionSummarySections,
  SummaryItem,
} from '@classinteract/shared';
import { ACTIVITY_STATUS_LABELS, ACTIVITY_TYPE_LABELS, POST_TYPE_LABELS, QUESTION_STATUS_LABELS, SESSION_STATUS_LABELS } from '@classinteract/shared';
import { ResultBars } from '@/components/classroom/Activities';
import { sessionPath } from '@/components/classroom/hooks';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { dateLocale, tk } from '@/i18n';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/firestore';
import { useApi } from '@/lib/query';
import { cn, formatDate, formatDateTime, pct } from '@/lib/utils';
import { StudentProfileView, type ProfileData } from '../common/StudentProfileView';
import { sessionLabel } from '../common/SessionStatus';
import type { TopicRow } from './ClassOverviewPage';
import { FollowUpList, INSIGHTS_NOTICE, InsightGroups, useQuestionMap, type InsightsResponse } from './InsightsPage';

export const REPORT_TYPES = ['session', 'class', 'student', 'topics', 'unanswered', 'interactions', 'insights'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const TITLES: Record<ReportType, string> = {
  session: tk('Báo cáo buổi học'),
  class: tk('Báo cáo tổng hợp lớp học'),
  student: tk('Báo cáo tham gia của sinh viên'),
  topics: tk('Báo cáo câu hỏi theo chủ đề'),
  unanswered: tk('Danh sách câu hỏi chưa được giải đáp'),
  interactions: tk('So sánh tương tác giữa các buổi học'),
  insights: tk('Gợi ý giảng dạy'),
};

const isReportType = (v: string): v is ReportType => (REPORT_TYPES as readonly string[]).includes(v);

/** A4 content width (210mm − 2 × 14mm margins) in CSS pixels, so charts look the same on screen and on paper. */
const CHART_W = 680;
const UNTAGGED = tk('Chưa phân loại');
const MAX_TOPICS = 20;

const PRINT_CSS = `
@page { size: A4; margin: 14mm 14mm 16mm; }
@media print {
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

// ---------------------------------------------------------------- data shapes

interface OverviewSession {
  sessionId: string;
  sessionNumber: number;
  title: string;
  date: string;
  status: SessionStatus;
  stats: SessionStatsDoc | null;
}
interface Overview {
  stats: ClassStatsDoc | null;
  totals: { students: number; interacted: number; notInteracted: number; interactionRate: number | null; completionRate: number | null };
  sessions: OverviewSession[];
  distribution: { label: string; count: number }[];
  topics: TopicRow[];
}
interface SessionAnalytics {
  session: SessionDoc;
  stats: SessionStatsDoc | null;
  attendance: AttendanceDoc[];
  activities: (ActivityDoc & { results: ActivityResultsDoc | null })[];
  openQuestions: PostDoc[];
}
type Thread = PostDoc & { replies: PostDoc[] };

// ---------------------------------------------------------------- layout helpers

function Section({ title, children, breakBefore, className }: { title: ReactNode; children: ReactNode; breakBefore?: boolean; className?: string }) {
  return (
    <section className={cn('mt-8', breakBefore && 'print:break-before-page', className)}>
      <h2 className="mb-3 break-after-avoid border-b-2 border-slate-800 pb-1 text-base font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="break-inside-avoid rounded-md border border-slate-300 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

const StatGrid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>;

function PTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-xs">
        <thead className="print:table-header-group">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border border-slate-300 bg-slate-100 px-1.5 py-1 text-left text-[11px] font-semibold leading-tight">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const PTd = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn('border border-slate-300 px-1.5 py-1 align-top', className)}>{children}</td>;
const num = 'text-right tabular-nums';

function ChartBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <figure className="mt-4 break-inside-avoid">
      <figcaption className="mb-1 text-sm font-semibold">{title}</figcaption>
      <div className="overflow-x-auto print:overflow-visible">{children}</div>
    </figure>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm italic text-slate-500">{children}</p>;
}

function Loading({ state }: { state: { isLoading: boolean; error: unknown } }) {
  if (state.isLoading) return <Spinner />;
  return <ErrorState error={state.error} />;
}

// ---------------------------------------------------------------- shared charts

function useSessionChart(sessions: OverviewSession[]) {
  const { t } = useTranslation();
  return sessions
    .filter((s) => s.status !== 'draft')
    .map((s) => {
      const st = s.stats;
      return {
        name: t('B{{n}}', { n: s.sessionNumber }),
        questions: st?.questionCount ?? 0,
        answers: st?.answerCount ?? 0,
        comments: (st?.commentCount ?? 0) + (st?.reflectionCount ?? 0),
        attendees: st?.attendeeCount ?? 0,
        interacted: st?.interactedCount ?? 0,
        rate: st?.attendeeCount ? Math.round(((st.interactedCount ?? 0) / st.attendeeCount) * 100) : 0,
      };
    });
}

function InteractionBars({ data }: { data: ReturnType<typeof useSessionChart> }) {
  const { t } = useTranslation();
  return (
    <ChartBox title={t('Tương tác theo buổi học')}>
      <BarChart width={CHART_W} height={250} data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" fontSize={11} />
        <YAxis allowDecimals={false} fontSize={11} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="questions" name={t('Câu hỏi', { context: 'n' })} fill="#ea580c" isAnimationActive={false} maxBarSize={48} />
        <Bar dataKey="answers" name={t('Trả lời', { context: 'n' })} fill="#0f766e" isAnimationActive={false} maxBarSize={48} />
        <Bar dataKey="comments" name={t('Bình luận', { context: 'n' })} fill="#94a3b8" isAnimationActive={false} maxBarSize={48} />
      </BarChart>
    </ChartBox>
  );
}

function ParticipationLines({ data }: { data: ReturnType<typeof useSessionChart> }) {
  const { t } = useTranslation();
  return (
    <ChartBox title={t('Sinh viên tham gia qua các buổi')}>
      <LineChart width={CHART_W} height={230} data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" fontSize={11} />
        <YAxis allowDecimals={false} fontSize={11} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="attendees" name={t('SV tham gia')} stroke="#1d4ed8" strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="interacted" name={t('SV có tương tác')} stroke="#ea580c" strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ChartBox>
  );
}

function DistributionBars({ data }: { data: Overview['distribution'] }) {
  const { t } = useTranslation();
  return (
    <ChartBox title={t('Phân bố mức độ tương tác')}>
      <BarChart width={CHART_W} height={220} data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" fontSize={11} />
        <YAxis allowDecimals={false} fontSize={11} />
        <Bar dataKey="count" name={t('Sinh viên', { context: 'n' })} fill="#1d4ed8" isAnimationActive={false} maxBarSize={48} label={{ position: 'top', fontSize: 11 }} />
      </BarChart>
    </ChartBox>
  );
}

function TotalsGrid({ data }: { data: Overview }) {
  const { t } = useTranslation();
  return (
    <StatGrid>
      <Stat label={t('Sinh viên', { context: 'n' })} value={data.totals.students} />
      <Stat label={t('Có ít nhất 1 tương tác')} value={pct(data.totals.interactionRate)} hint={t('{{count}} sinh viên', { count: data.totals.interacted })} />
      <Stat label={t('Chưa tương tác')} value={data.totals.notInteracted} />
      <Stat label={t('Buổi đã diễn ra')} value={data.stats?.sessionsHeld ?? 0} />
      <Stat label={t('Câu hỏi / Trả lời')} value={`${data.stats?.questionCount ?? 0} / ${data.stats?.answerCount ?? 0}`} />
      <Stat label={t('Bình luận/Nhận xét')} value={(data.stats?.commentCount ?? 0) + (data.stats?.reflectionCount ?? 0)} />
      <Stat label={t('Chưa giải đáp')} value={data.stats?.openQuestionCount ?? 0} />
      <Stat label={t('Hoạt động · hoàn thành')} value={`${data.stats?.activityCount ?? 0} · ${pct(data.totals.completionRate)}`} hint={t('Tính trên SV có mặt')} />
    </StatGrid>
  );
}

function TopicTable({ topics }: { topics: TopicRow[] }) {
  const { t } = useTranslation();
  if (!topics.length) return <Muted>{t('Chưa có chủ đề')}</Muted>;
  return (
    <PTable head={[t('Chủ đề'), t('Câu hỏi', { context: 'n' }), t('Trả lời', { context: 'n' }), t('Bình luận', { context: 'n' }), t('Chưa giải đáp'), t('SV tham gia'), t('Số buổi')]}>
      {topics.map((r) => (
        <tr key={r.topic} className="break-inside-avoid">
          <PTd>{r.topic === UNTAGGED ? t(UNTAGGED) : r.topic}</PTd>
          <PTd className={num}>{r.questions}</PTd>
          <PTd className={num}>{r.answers}</PTd>
          <PTd className={num}>{r.comments}</PTd>
          <PTd className={num}>{r.openQuestions}</PTd>
          <PTd className={num}>{r.participants}</PTd>
          <PTd className={num}>{r.sessions}</PTd>
        </tr>
      ))}
    </PTable>
  );
}

// ---------------------------------------------------------------- reports

function ClassReport({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const q = useApi<Overview>(`/classes/${classId}/analytics/overview`);
  const chart = useSessionChart(q.data?.sessions ?? []);
  if (!q.data) return <Loading state={q} />;
  const d = q.data;
  const held = d.sessions.filter((s) => s.status !== 'draft');
  return (
    <>
      <Section title={t('Số liệu chính')}>
        <TotalsGrid data={d} />
      </Section>
      <Section title={t('Thống kê theo buổi học')}>
        {held.length ? (
          <PTable head={[t('Buổi'), t('Ngày'), t('Tiêu đề'), t('SV tham gia'), t('SV có tương tác'), t('Câu hỏi', { context: 'n' }), t('Trả lời', { context: 'n' }), t('Chưa giải đáp'), t('Hoạt động', { context: 'activity' })]}>
            {held.map((s) => (
              <tr key={s.sessionId} className="break-inside-avoid">
                <PTd className={num}>{s.sessionNumber}</PTd>
                <PTd className="whitespace-nowrap">{formatDate(s.date)}</PTd>
                <PTd>{s.title}</PTd>
                <PTd className={num}>{s.stats?.attendeeCount ?? 0}</PTd>
                <PTd className={num}>{s.stats?.interactedCount ?? 0}</PTd>
                <PTd className={num}>{s.stats?.questionCount ?? 0}</PTd>
                <PTd className={num}>{s.stats?.answerCount ?? 0}</PTd>
                <PTd className={num}>{s.stats?.openQuestionCount ?? 0}</PTd>
                <PTd className={num}>{s.stats?.activityCount ?? 0}</PTd>
              </tr>
            ))}
          </PTable>
        ) : (
          <Muted>{t('Chưa có buổi học nào diễn ra')}</Muted>
        )}
      </Section>
      {held.length > 0 && (
        <Section title={t('Biểu đồ')} breakBefore>
          <InteractionBars data={chart} />
          <ParticipationLines data={chart} />
          <DistributionBars data={d.distribution} />
        </Section>
      )}
      <Section title={t('Chủ đề được quan tâm nhiều nhất')} breakBefore={held.length > 0}>
        <TopicTable topics={d.topics} />
      </Section>
    </>
  );
}

function InteractionsReport({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const q = useApi<Overview>(`/classes/${classId}/analytics/overview`);
  const chart = useSessionChart(q.data?.sessions ?? []);
  if (!q.data) return <Loading state={q} />;
  const d = q.data;
  const held = d.sessions.filter((s) => s.status !== 'draft');
  if (!held.length) return <EmptyState title={t('Chưa có buổi học nào diễn ra')} />;
  const total = d.distribution.reduce((s, b) => s + b.count, 0);
  return (
    <>
      <Section title={t('Bảng so sánh các buổi học')}>
        <PTable
          head={[t('Buổi'), t('Ngày'), t('SV tham gia'), t('SV có tương tác'), t('Tỷ lệ tương tác'), t('Câu hỏi', { context: 'n' }), t('Trả lời', { context: 'n' }), t('Bình luận', { context: 'n' }), t('Hoạt động', { context: 'activity' }), t('Lượt nộp bài')]}
        >
          {held.map((s) => {
            const st = s.stats;
            return (
              <tr key={s.sessionId} className="break-inside-avoid">
                <PTd className={num}>{s.sessionNumber}</PTd>
                <PTd className="whitespace-nowrap">{formatDate(s.date)}</PTd>
                <PTd className={num}>{st?.attendeeCount ?? 0}</PTd>
                <PTd className={num}>{st?.interactedCount ?? 0}</PTd>
                <PTd className={num}>{pct(st?.attendeeCount ? (st.interactedCount ?? 0) / st.attendeeCount : null)}</PTd>
                <PTd className={num}>{st?.questionCount ?? 0}</PTd>
                <PTd className={num}>{st?.answerCount ?? 0}</PTd>
                <PTd className={num}>{(st?.commentCount ?? 0) + (st?.reflectionCount ?? 0)}</PTd>
                <PTd className={num}>{st?.activityCount ?? 0}</PTd>
                <PTd className={num}>{st?.submissionCount ?? 0}</PTd>
              </tr>
            );
          })}
        </PTable>
        <p className="mt-2 text-xs text-slate-500">{t('Tỷ lệ tương tác = số SV có tương tác / số SV tham gia buổi học.')}</p>
      </Section>
      <Section title={t('Biểu đồ so sánh')} breakBefore>
        <InteractionBars data={chart} />
        <ParticipationLines data={chart} />
        <ChartBox title={t('Tỷ lệ sinh viên có tương tác (%)')}>
          <BarChart width={CHART_W} height={200} data={chart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis domain={[0, 100]} fontSize={11} />
            <Bar dataKey="rate" name={t('Tỷ lệ tương tác')} fill="#0f766e" isAnimationActive={false} maxBarSize={48} label={{ position: 'top', fontSize: 10 }} />
          </BarChart>
        </ChartBox>
      </Section>
      <Section title={t('Phân bố mức độ tham gia')} breakBefore>
        <p className="mb-2 text-sm text-slate-600">{t('Số sinh viên theo tổng số tương tác trong học kỳ')}</p>
        <DistributionBars data={d.distribution} />
        <div className="mt-4">
          <PTable head={[t('Số tương tác'), t('Sinh viên', { context: 'n' }), t('Tỷ lệ')]}>
            {d.distribution.map((b) => (
              <tr key={b.label}>
                <PTd>{b.label}</PTd>
                <PTd className={num}>{b.count}</PTd>
                <PTd className={num}>{pct(total ? b.count / total : null)}</PTd>
              </tr>
            ))}
          </PTable>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('Số liệu chỉ phản ánh mức độ tương tác trên hệ thống, không phải đánh giá năng lực học tập.')}</p>
      </Section>
    </>
  );
}

function useSessionPosts(classId: string, sessionId: string | null) {
  const q = useMemo(
    () => (sessionId ? query(collection(db, sessionPath(classId, sessionId), 'posts'), orderBy('createdAt', 'asc'), limit(1500)) : null),
    [classId, sessionId],
  );
  return useLiveQuery<PostDoc>(q);
}

const SUMMARY_SECTIONS: [Exclude<keyof SessionSummarySections, 'mainContent'>, string][] = [
  ['topicsDiscussed', tk('Chủ đề đã thảo luận')],
  ['keyQuestions', tk('Câu hỏi chính')],
  ['confirmedAnswers', tk('Câu trả lời đã được xác nhận')],
  ['unresolved', tk('Vấn đề chưa được giải quyết')],
  ['difficulties', tk('Nội dung sinh viên gặp khó khăn')],
  ['popular', tk('Nội dung được quan tâm nhiều')],
  ['nextSession', tk('Gợi ý cho buổi sau')],
];

function SummaryBlock({ summary }: { summary: SessionSummaryDoc }) {
  const { t } = useTranslation();
  const s = summary.sections;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-slate-500">
        {summary.status === 'approved' ? t('Đã được giảng viên duyệt') : t('Bản nháp – chưa được giảng viên duyệt')}
        {summary.generatedAt ? ` · ${t('Tạo bởi AI lúc {{time}}', { time: formatDateTime(summary.generatedAt) })}` : ''}
      </p>
      {s.mainContent && (
        <div>
          <h3 className="font-semibold">{t('Nội dung chính')}</h3>
          <p className="mt-0.5 whitespace-pre-line">{s.mainContent}</p>
        </div>
      )}
      {SUMMARY_SECTIONS.map(([k, label]) => {
        const items = (s[k] ?? []) as SummaryItem[];
        if (!items.length) return null;
        return (
          <div key={k} className="break-inside-avoid">
            <h3 className="font-semibold">{t(label)}</h3>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
              {items.map((it, i) => (
                <li key={i}>{it.text}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function PostLine({ p, compact }: { p: PostDoc; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn('text-sm', compact && 'text-[13px]')}>
      <p className="text-xs text-slate-500">
        <span className="font-medium text-slate-700">{p.isAnonymous ? t('Ẩn danh') : p.authorName}</span>
        {' · '}
        {t(POST_TYPE_LABELS[p.type])}
        {p.type === 'question' && p.status ? ` · ${t(QUESTION_STATUS_LABELS[p.status])}` : ''}
        {p.voteCount ? ` · ${t('{{n}} lượt bình chọn', { n: p.voteCount })}` : ''}
        {p.isAccepted ? ` · ✔ ${t('GV xác nhận')}` : ''}
        {p.isAiGenerated ? ` · ${t('Do AI hỗ trợ')}` : ''}
        {' · '}
        {formatDateTime(p.createdAt)}
      </p>
      <p className="mt-0.5 whitespace-pre-line">{p.content}</p>
    </div>
  );
}

function ThreadBlock({ root, replies }: { root: PostDoc; replies: PostDoc[] }) {
  return (
    <li className="break-inside-avoid rounded-md border border-slate-300 p-3">
      <PostLine p={root} />
      {replies.length > 0 && (
        <ul className="mt-2 space-y-2 border-l-2 border-slate-200 pl-3">
          {replies.map((r) => (
            <li key={r.postId} className={cn(r.isAccepted && 'rounded bg-emerald-50 px-2 py-1')}>
              <PostLine p={r} compact />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SessionReport({ classId, sessionId }: { classId: string; sessionId: string | null }) {
  const { t } = useTranslation();
  const q = useApi<SessionAnalytics>(sessionId ? `/classes/${classId}/sessions/${sessionId}/analytics` : null);
  const sum = useApi<{ summary: SessionSummaryDoc | null }>(sessionId ? `/classes/${classId}/sessions/${sessionId}/summary` : null);
  const posts = useSessionPosts(classId, sessionId);
  if (!sessionId) return <EmptyState title={t('Chưa chọn buổi học')} description={t('Hãy chọn buổi học ở trang Báo cáo.')} />;
  if (!q.data) return <Loading state={q} />;
  const { session: s, stats } = q.data;
  const visible = posts.data.filter((p) => p.moderationStatus === 'visible');
  const roots = visible.filter((p) => p.isRoot);
  const repliesOf = new Map<string, PostDoc[]>();
  visible.filter((p) => !p.isRoot && p.rootPostId).forEach((p) => repliesOf.set(p.rootPostId!, [...(repliesOf.get(p.rootPostId!) ?? []), p]));
  const questions = roots.filter((p) => p.type === 'question').sort((a, b) => b.voteCount - a.voteCount);
  const otherRoots = roots.filter((p) => p.type !== 'question');
  const attendees = q.data.attendance.length;
  return (
    <>
      <Section title={t('Thông tin buổi học')}>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="font-medium text-slate-500">{t('Tên buổi học')}</dt>
          <dd className="font-semibold">{sessionLabel(s)}</dd>
          <dt className="font-medium text-slate-500">{t('Thời gian')}</dt>
          <dd>
            {formatDate(s.date)} · {s.plannedStart}–{s.plannedEnd}
            {s.startedAt ? ` (${t('bắt đầu {{time}}', { time: formatDateTime(s.startedAt) })})` : ''}
          </dd>
          <dt className="font-medium text-slate-500">{t('Trạng thái')}</dt>
          <dd>{t(SESSION_STATUS_LABELS[s.status])}</dd>
          {s.topics.length > 0 && (
            <>
              <dt className="font-medium text-slate-500">{t('Chủ đề')}</dt>
              <dd>{s.topics.join(', ')}</dd>
            </>
          )}
          {s.description && (
            <>
              <dt className="font-medium text-slate-500">{t('Mô tả')}</dt>
              <dd className="whitespace-pre-line">{s.description}</dd>
            </>
          )}
        </dl>
      </Section>
      <Section title={t('Số liệu buổi học')}>
        <StatGrid>
          <Stat label={t('SV tham gia')} value={attendees} />
          <Stat label={t('SV có tương tác')} value={stats?.interactedCount ?? 0} hint={pct(attendees ? (stats?.interactedCount ?? 0) / attendees : null)} />
          <Stat label={t('Câu hỏi', { context: 'n' })} value={stats?.questionCount ?? 0} />
          <Stat label={t('Trả lời', { context: 'n' })} value={stats?.answerCount ?? 0} />
          <Stat label={t('Bình luận/Nhận xét')} value={(stats?.commentCount ?? 0) + (stats?.reflectionCount ?? 0)} />
          <Stat label={t('Chưa giải đáp')} value={q.data.openQuestions.length} />
          <Stat label={t('Hoạt động', { context: 'activity' })} value={stats?.activityCount ?? q.data.activities.length} />
          <Stat label={t('Lượt nộp bài')} value={stats?.submissionCount ?? 0} />
        </StatGrid>
      </Section>
      <Section title={t('Hoạt động và kết quả')}>
        {q.data.activities.length ? (
          <div className="space-y-4">
            {q.data.activities.map((a) => (
              <div key={a.activityId} className="break-inside-avoid rounded-md border border-slate-300 p-3">
                <p className="text-xs text-slate-500">
                  {t(ACTIVITY_TYPE_LABELS[a.type])} · {t(ACTIVITY_STATUS_LABELS[a.status])}
                </p>
                <h3 className="font-semibold">{a.title}</h3>
                {a.prompt && <p className="mb-2 whitespace-pre-line text-sm text-slate-700">{a.prompt}</p>}
                {a.options.length ? <ResultBars activity={a} results={a.results} /> : <Muted>{t('{{n}} lượt trả lời', { n: a.results?.submissionCount ?? 0 })}</Muted>}
              </div>
            ))}
          </div>
        ) : (
          <Muted>{t('Buổi học không có hoạt động.')}</Muted>
        )}
      </Section>
      {sum.data?.summary && (
        <Section title={t('Tóm tắt buổi học')} breakBefore>
          <SummaryBlock summary={sum.data.summary} />
        </Section>
      )}
      <Section title={t('Câu hỏi và trả lời')} breakBefore>
        {posts.loading ? (
          <Spinner />
        ) : questions.length ? (
          <ol className="space-y-3">
            {questions.map((p) => (
              <ThreadBlock key={p.postId} root={p} replies={repliesOf.get(p.postId) ?? []} />
            ))}
          </ol>
        ) : (
          <Muted>{t('Chưa có câu hỏi')}</Muted>
        )}
      </Section>
      {otherRoots.length > 0 && (
        <Section title={t('Thảo luận và nhận xét khác')}>
          <ol className="space-y-3">
            {otherRoots.map((p) => (
              <ThreadBlock key={p.postId} root={p} replies={repliesOf.get(p.postId) ?? []} />
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}

function TopicThreads({ classId, topic, index }: { classId: string; topic: TopicRow; index: number }) {
  const { t } = useTranslation();
  const q = useApi<{ threads: Thread[] }>(`/classes/${classId}/analytics/topics?topic=${encodeURIComponent(topic.topic)}`);
  const name = topic.topic === UNTAGGED ? t(UNTAGGED) : topic.topic;
  return (
    <Section title={`${index + 1}. ${name}`} breakBefore={index === 0} className="print:break-inside-auto">
      <p className="mb-2 text-xs text-slate-500">
        {t('{{q}} câu hỏi · {{a}} trả lời · {{o}} chưa giải đáp · {{p}} SV tham gia', { q: topic.questions, a: topic.answers, o: topic.openQuestions, p: topic.participants })}
      </p>
      {!q.data ? (
        <Loading state={q} />
      ) : q.data.threads.length ? (
        <ol className="space-y-3">
          {[...q.data.threads]
            .sort((a, b) => b.voteCount - a.voteCount)
            .map((th) => (
              <ThreadBlock key={th.postId} root={th} replies={th.replies} />
            ))}
        </ol>
      ) : (
        <Muted>{t('Chưa có bài đăng')}</Muted>
      )}
    </Section>
  );
}

function TopicsReport({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const q = useApi<{ topics: TopicRow[] }>(`/classes/${classId}/analytics/topics`);
  if (!q.data) return <Loading state={q} />;
  const topics = q.data.topics;
  if (!topics.length) return <EmptyState title={t('Chưa có chủ đề')} />;
  const shown = topics.slice(0, MAX_TOPICS);
  return (
    <>
      <Section title={t('Tổng hợp theo chủ đề')}>
        <TopicTable topics={topics} />
        {topics.length > MAX_TOPICS && <p className="mt-2 text-xs text-slate-500">{t('Báo cáo chi tiết {{n}} chủ đề có nhiều tương tác nhất.', { n: MAX_TOPICS })}</p>}
      </Section>
      {shown.map((tp, i) => (
        <TopicThreads key={tp.topic} classId={classId} topic={tp} index={i} />
      ))}
    </>
  );
}

function UnansweredReport({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const q = useApi<{ items: PostDoc[] }>(`/classes/${classId}/questions?status=open`);
  const sessions = useApi<{ items: SessionDoc[] }>(`/classes/${classId}/sessions`);
  if (!q.data) return <Loading state={q} />;
  const num_ = new Map((sessions.data?.items ?? []).map((s) => [s.sessionId, s.sessionNumber]));
  const items = q.data.items;
  return (
    <Section title={t('{{n}} câu hỏi chưa được giải đáp', { n: items.length })}>
      {items.length ? (
        <>
          <p className="mb-2 text-xs text-slate-500">{t('Gồm câu hỏi ở trạng thái “Mới” hoặc “Cần làm rõ”, sắp xếp theo lượt bình chọn.')}</p>
          <PTable head={['#', t('Buổi'), t('Lượt bình chọn'), t('Nội dung'), t('Trạng thái'), t('Thời gian đăng')]}>
            {items.map((p, i) => (
              <tr key={p.postId} className="break-inside-avoid">
                <PTd className={num}>{i + 1}</PTd>
                <PTd className={num}>{num_.get(p.sessionId) ?? '—'}</PTd>
                <PTd className={num}>{p.voteCount}</PTd>
                <PTd className="whitespace-pre-line">
                  {p.content}
                  {p.topics?.length ? <span className="mt-0.5 block text-xs text-slate-500">#{p.topics.join(' #')}</span> : null}
                </PTd>
                <PTd className="whitespace-nowrap">{p.status ? t(QUESTION_STATUS_LABELS[p.status]) : ''}</PTd>
                <PTd className="whitespace-nowrap">{formatDateTime(p.createdAt)}</PTd>
              </tr>
            ))}
          </PTable>
        </>
      ) : (
        <Muted>{t('Không còn câu hỏi nào chưa được giải đáp.')}</Muted>
      )}
    </Section>
  );
}

function InsightsReport({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const q = useApi<InsightsResponse>(`/classes/${classId}/insights`);
  const doc = q.data?.insights ?? null;
  const posts = useQuestionMap(classId, !!doc?.insights.some((i) => i.refs.length));
  if (!q.data) return <Loading state={q} />;
  if (!doc) return <EmptyState title={t('Chưa có gợi ý giảng dạy')} description={t('Hãy chạy “Phân tích bằng AI” ở trang Gợi ý AI trước.')} />;
  return (
    <>
      <p className="mt-6 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {t(INSIGHTS_NOTICE)} {t('Phân tích lúc {{time}}', { time: formatDateTime(doc.generatedAt) })}.
      </p>
      <Section title={t('Nhận định và căn cứ')}>
        <InsightGroups doc={doc} posts={posts} classId={classId} print />
      </Section>
      <Section title={t('Câu hỏi tiếp nối')} className="break-inside-avoid">
        <FollowUpList questions={doc.followUpQuestions} print />
      </Section>
    </>
  );
}

function StudentReport({ classId, uid }: { classId: string; uid: string | null }) {
  const { t } = useTranslation();
  const q = useApi<ProfileData>(uid ? `/classes/${classId}/analytics/students/${uid}` : null);
  if (!uid) return <EmptyState title={t('Chưa chọn sinh viên')} description={t('Hãy chọn sinh viên ở trang Báo cáo.')} />;
  const m = q.data?.member;
  return (
    <>
      {m && (
        <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="font-medium text-slate-500">{t('Sinh viên')}</dt>
          <dd className="font-semibold">{m.displayName}</dd>
          {m.studentId && (
            <>
              <dt className="font-medium text-slate-500">{t('Mã sinh viên')}</dt>
              <dd>{m.studentId}</dd>
            </>
          )}
        </dl>
      )}
      {/* Let the reused profile cards shrink to the A4 width (long labels would otherwise overflow). */}
      <div className="mt-6 [&_.grid>*]:min-w-0 [&_p]:break-words">
        <StudentProfileView classId={classId} uid={uid} linkBase={`/teach/classes/${classId}`} />
      </div>
      <p className="mt-4 text-xs text-slate-500">
        {t('Báo cáo chứa thông tin cá nhân của sinh viên – chỉ dùng cho mục đích giảng dạy. Số liệu phản ánh mức độ tương tác, không phải đánh giá năng lực học tập.')}
      </p>
    </>
  );
}

// ---------------------------------------------------------------- page

function ReportHeader({ cls, title }: { cls: ClassDoc; title: string }) {
  const { t } = useTranslation();
  const generated = new Date().toLocaleString(dateLocale(), { dateStyle: 'long', timeStyle: 'short' });
  return (
    <header className="border-b border-slate-300 pb-4">
      <div className="flex items-start justify-between gap-4 text-xs text-slate-500">
        <span className="font-semibold tracking-wide text-primary">ClassInteract AI</span>
        <span>{t('Ngày lập: {{date}}', { date: generated })}</span>
      </div>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{t(title)}</h1>
      <p className="mt-1 text-sm">
        <span className="font-semibold">{cls.classCode}</span> – {cls.name}
        {cls.courseName && cls.courseName !== cls.name ? ` · ${cls.courseName}` : ''}
      </p>
      <p className="text-sm text-slate-600">
        {t('Học kỳ: {{semester}} – {{year}}', { semester: cls.semester, year: cls.academicYear })}
        {cls.lecturerNames.length ? ` · ${t('Giảng viên')}: ${cls.lecturerNames.join(', ')}` : ''}
      </p>
    </header>
  );
}

export function ReportPrintPage() {
  const { t } = useTranslation();
  const { classId = '', type = '' } = useParams();
  const [params] = useSearchParams();
  const { data, isLoading, error } = useApi<{ class: ClassDoc }>(`/classes/${classId}`);
  const valid = isReportType(type);
  const title = valid ? TITLES[type] : tk('Báo cáo');
  const cls = data?.class;

  useEffect(() => {
    if (!cls) return;
    const prev = document.title;
    document.title = `${cls.classCode} – ${t(title)}`;
    return () => {
      document.title = prev;
    };
  }, [cls, title, t]);

  let body: ReactNode = null;
  if (valid) {
    const sessionId = params.get('sessionId');
    const uid = params.get('uid');
    body = {
      session: <SessionReport classId={classId} sessionId={sessionId} />,
      class: <ClassReport classId={classId} />,
      student: <StudentReport classId={classId} uid={uid} />,
      topics: <TopicsReport classId={classId} />,
      unanswered: <UnansweredReport classId={classId} />,
      interactions: <InteractionsReport classId={classId} />,
      insights: <InsightsReport classId={classId} />,
    }[type];
  }

  return (
    <div className="min-h-dvh bg-slate-200 text-slate-900 print:bg-white">
      <style>{PRINT_CSS}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-white/95 px-4 py-2 backdrop-blur print:hidden">
        <Link to={`/teach/classes/${classId}/reports`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ChevronLeft className="h-4 w-4" /> {t('Báo cáo')}
        </Link>
        <span className="hidden text-sm font-medium sm:inline">{t(title)}</span>
        <Button size="sm" onClick={() => window.print()} disabled={!cls}>
          <Printer className="h-4 w-4" /> {t('In / Lưu PDF')}
        </Button>
      </div>
      <main className="mx-auto my-6 w-[210mm] max-w-full bg-white px-4 py-8 shadow-lg sm:px-[14mm] sm:py-[12mm] print:m-0 print:w-auto print:max-w-none print:p-0 print:shadow-none">
        {isLoading ? (
          <Spinner />
        ) : error || !cls ? (
          <ErrorState error={error} />
        ) : !valid ? (
          <EmptyState title={t('Loại báo cáo không hợp lệ')} />
        ) : (
          <>
            <ReportHeader cls={cls} title={title} />
            {body}
            <footer className="mt-10 border-t border-slate-300 pt-2 text-[11px] text-slate-500">
              {t('Báo cáo được tạo tự động từ ClassInteract AI. Số liệu tại thời điểm lập báo cáo.')}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
