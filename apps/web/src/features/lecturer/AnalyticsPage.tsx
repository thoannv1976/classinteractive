import { ArrowDown, ArrowUp, Download, Info, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/query';
import { cn, formatDate, pct, timeAgo } from '@/lib/utils';
import type { Time } from '@classinteract/shared';
import { useClassCtx } from './ClassLayout';

export interface StudentRow {
  uid: string;
  studentId: string | null;
  displayName: string;
  memberRole: string;
  sessionsJoined: number;
  questions: number;
  answers: number;
  comments: number;
  reflections: number;
  reactions: number;
  activitiesCompleted: number;
  pollsAnswered: number;
  quizzesAnswered: number;
  quizCorrect: number;
  acceptedAnswers: number;
  openQuestions: number;
  topicsCovered: number;
  interactions: number;
  attendanceRate: number | null;
  activityCompletionRate: number | null;
  quizAccuracy: number | null;
  consistency: number | null;
  lastActiveAt: Time | null;
}

interface Data {
  rows: StudentRow[];
  sessions: { sessionId: string; sessionNumber: number; title: string; date: string }[];
  heatmap: Record<string, Record<string, number>>;
  joined: Record<string, string[]>;
  opportunities: { sessionsHeld: number; activitiesOpened: number };
}

type SortKey = 'studentId' | 'displayName' | 'sessionsJoined' | 'questions' | 'answers' | 'activitiesCompleted' | 'topicsCovered' | 'interactions' | 'consistency';

const heat = (v: number | undefined, joined: boolean) => {
  if (!joined) return 'bg-slate-100 text-slate-300';
  if (!v) return 'bg-blue-50 text-blue-300';
  if (v <= 1) return 'bg-blue-200 text-blue-900';
  if (v <= 3) return 'bg-blue-400 text-white';
  if (v <= 6) return 'bg-blue-600 text-white';
  return 'bg-blue-800 text-white';
};

export function AnalyticsPage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const { data, isLoading, error } = useApi<Data>(`/classes/${cls.classId}/analytics/students`);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'studentId', dir: 1 });
  const [range, setRange] = useState<'all' | string>('all');
  const [downloading, setDownloading] = useState(false);

  // Optional session filter: recompute interactions from the heatmap for one session.
  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) r = r.filter((x) => `${x.studentId} ${x.displayName}`.toLowerCase().includes(needle));
    if (range !== 'all' && data) r = r.map((x) => ({ ...x, interactions: data.heatmap[x.uid]?.[range] ?? 0 }));
    return [...r].sort((a, b) => {
      const va = a[sort.key] ?? -1;
      const vb = b[sort.key] ?? -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [data, q, sort, range]);

  const th = (key: SortKey, label: string, right = true) => (
    <Th className={right ? 'text-right' : undefined} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'studentId' || key === 'displayName' ? 1 : -1 }))}>
      <span className={cn('inline-flex items-center gap-1', right && 'justify-end')}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </Th>
  );

  const exportXlsx = async () => {
    setDownloading(true);
    try {
      await api.download(`/classes/${cls.classId}/export?format=xlsx`, `${cls.classCode}.xlsx`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} />;
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-primary-soft/60 px-4 py-3 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {t('Tỷ lệ được tính theo cơ hội thực tế: {{sessions}} buổi đã diễn ra và {{activities}} hoạt động đã mở. Đây là số liệu tham khảo để giảng viên quan tâm, không tự động đưa vào bảng điểm.', { sessions: data.opportunities.sessionsHeld, activities: data.opportunities.activitiesOpened })}
        </p>
      </div>
      <Card>
        <CardHeader
          title={t('Bảng tham gia của sinh viên')}
          actions={
            <Button variant="outline" onClick={exportXlsx} loading={downloading}>
              <Download className="h-4 w-4" /> {t('Xuất Excel')}
            </Button>
          }
        />
        <div className="flex flex-wrap gap-2 px-4 pt-4 sm:px-5">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Tìm sinh viên')} className="pl-9" aria-label={t('Tìm sinh viên')} />
          </div>
          <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-auto" aria-label={t('Lọc theo buổi')}>
            <option value="all">{t('Cả học kỳ')}</option>
            {data.sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>{t('Tương tác trong buổi {{n}}', { n: s.sessionNumber })}</option>
            ))}
          </Select>
        </div>
        <CardBody className="p-0 pt-3 sm:p-0 sm:pt-3">
          {!rows.length ? (
            <EmptyState title={t('Chưa có sinh viên')} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t('STT')}</Th>
                  {th('studentId', t('Mã SV'), false)}
                  {th('displayName', t('Họ tên'), false)}
                  {th('sessionsJoined', t('Số buổi'))}
                  {th('questions', t('Câu hỏi', { context: 'n' }))}
                  {th('answers', t('Trả lời', { context: 'n' }))}
                  {th('activitiesCompleted', t('Hoạt động'))}
                  {th('topicsCovered', t('Chủ đề'))}
                  {th('consistency', t('Đều đặn'))}
                  {th('interactions', range === 'all' ? t('Tổng tương tác') : t('Tương tác buổi'))}
                  <Th>{t('Gần nhất')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.uid} className={cn('hover:bg-slate-50', r.interactions === 0 && 'bg-amber-50/40')}>
                    <Td className="text-muted">{i + 1}</Td>
                    <Td className="font-mono text-xs">{r.studentId}</Td>
                    <Td>
                      <Link to={`students/${r.uid}`} className="font-medium hover:text-primary">{r.displayName}</Link>
                    </Td>
                    <Td className="text-right tabular-nums">{r.sessionsJoined} <span className="text-xs text-muted">({pct(r.attendanceRate)})</span></Td>
                    <Td className="text-right tabular-nums">{r.questions}</Td>
                    <Td className="text-right tabular-nums">{r.answers}{r.acceptedAnswers > 0 && <span className="ml-1 text-xs text-success">✓{r.acceptedAnswers}</span>}</Td>
                    <Td className="text-right tabular-nums">{r.activitiesCompleted} <span className="text-xs text-muted">({pct(r.activityCompletionRate)})</span></Td>
                    <Td className="text-right tabular-nums">{r.topicsCovered}</Td>
                    <Td className="text-right tabular-nums">{pct(r.consistency)}</Td>
                    <Td className="text-right font-semibold tabular-nums">{r.interactions}</Td>
                    <Td className="text-xs text-muted">{r.lastActiveAt ? timeAgo(r.lastActiveAt) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Bản đồ nhiệt tham gia')} description={t('Số tương tác của từng sinh viên trong mỗi buổi học. Ô xám: không có mặt.')} />
        <CardBody>
          {!data.sessions.length ? (
            <EmptyState title={t('Chưa có buổi học nào diễn ra')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-surface pr-3 text-left font-medium text-muted">{t('Sinh viên', { context: 'n' })}</th>
                    {data.sessions.map((s) => (
                      <th key={s.sessionId} className="px-0.5 font-medium text-muted" title={`${s.title} – ${formatDate(s.date)}`}>{t('B{{n}}', { n: s.sessionNumber })}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.rows ?? []).map((r) => (
                    <tr key={r.uid}>
                      <td className="sticky left-0 max-w-[180px] truncate bg-surface py-0.5 pr-3">{r.displayName}</td>
                      {data.sessions.map((s) => {
                        const v = data.heatmap[r.uid]?.[s.sessionId];
                        const joined = (data.joined[r.uid] ?? []).includes(s.sessionId);
                        return (
                          <td key={s.sessionId} className="p-0.5">
                            <div className={cn('flex h-7 w-9 items-center justify-center rounded', heat(v, joined))} title={`${r.displayName} – ${t('Buổi {{n}}', { n: s.sessionNumber })}: ${joined ? t('{{count}} tương tác', { count: v ?? 0 }) : t('không tham gia')}`}>
                              {joined ? (v ?? 0) : ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
