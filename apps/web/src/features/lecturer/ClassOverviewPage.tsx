import { Activity, MessageCircleQuestion, MessagesSquare, UserCheck, UserX, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ClassStatsDoc, SessionStatsDoc, SessionStatus } from '@classinteract/shared';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { StatCard } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import { pct } from '@/lib/utils';
import { useClassCtx } from './ClassLayout';

export interface TopicRow {
  topic: string;
  questions: number;
  answers: number;
  comments: number;
  openQuestions: number;
  participants: number;
  sessions: number;
}

interface Overview {
  stats: ClassStatsDoc | null;
  totals: { students: number; interacted: number; notInteracted: number; interactionRate: number | null; completionRate: number | null };
  sessions: { sessionId: string; sessionNumber: number; title: string; date: string; status: SessionStatus; stats: SessionStatsDoc | null }[];
  distribution: { label: string; count: number }[];
  topics: TopicRow[];
}

export function ClassOverviewPage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const { data, isLoading, error } = useApi<Overview>(`/classes/${cls.classId}/analytics/overview`);
  const [params] = useSearchParams();
  const printMode = params.get('print') === '1';
  useEffect(() => {
    if (printMode && data) {
      const timer = setTimeout(() => window.print(), 1200);
      return () => clearTimeout(timer);
    }
  }, [printMode, data]);
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} />;
  const held = data.sessions.filter((s) => s.status !== 'draft');
  const chart = held.map((s) => ({
    name: t('B{{n}}', { n: s.sessionNumber }),
    questions: s.stats?.questionCount ?? 0,
    answers: s.stats?.answerCount ?? 0,
    comments: (s.stats?.commentCount ?? 0) + (s.stats?.reflectionCount ?? 0),
    attendees: s.stats?.attendeeCount ?? 0,
    interacted: s.stats?.interactedCount ?? 0,
  }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t('Sinh viên', { context: 'n' })} value={data.totals.students} icon={<Users className="h-4 w-4" />} />
        <StatCard label={t('Có ít nhất 1 tương tác')} value={pct(data.totals.interactionRate)} hint={t('{{count}} sinh viên', { count: data.totals.interacted })} icon={<UserCheck className="h-4 w-4" />} tone="secondary" />
        <StatCard label={t('Chưa tương tác')} value={data.totals.notInteracted} icon={<UserX className="h-4 w-4" />} tone="neutral" />
        <StatCard label={t('Câu hỏi / Trả lời')} value={`${data.stats?.questionCount ?? 0} / ${data.stats?.answerCount ?? 0}`} icon={<MessagesSquare className="h-4 w-4" />} tone="primary" />
        <StatCard label={t('Chưa giải đáp')} value={data.stats?.openQuestionCount ?? 0} icon={<MessageCircleQuestion className="h-4 w-4" />} tone="accent" />
        <StatCard label={t('Hoạt động · hoàn thành')} value={`${data.stats?.activityCount ?? 0} · ${pct(data.totals.completionRate)}`} hint={t('Tính trên SV có mặt')} icon={<Activity className="h-4 w-4" />} tone="secondary" />
      </div>
      {!held.length ? (
        <Card>
          <EmptyState title={t('Chưa có buổi học nào diễn ra')} description={t('Số liệu sẽ xuất hiện sau khi bạn bắt đầu buổi học đầu tiên.')} action={<Link to="sessions" className="text-sm font-medium text-primary">{t('Đến danh sách buổi học →')}</Link>} />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title={t('Tương tác theo buổi học')} />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="questions" name={t('Câu hỏi', { context: 'n' })} fill="#ea580c" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="answers" name={t('Trả lời', { context: 'n' })} fill="#0f766e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="comments" name={t('Bình luận', { context: 'n' })} fill="#94a3b8" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('Sinh viên tham gia qua các buổi')} />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="attendees" name={t('SV tham gia')} stroke="#1d4ed8" strokeWidth={2} />
                  <Line type="monotone" dataKey="interacted" name={t('SV có tương tác')} stroke="#ea580c" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('Phân bố mức độ tương tác')} description={t('Số sinh viên theo tổng số tương tác trong học kỳ')} />
            <CardBody className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.distribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" name={t('Sinh viên', { context: 'n' })} fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('Chủ đề được quan tâm nhiều nhất')} actions={<Link to="topics" className="text-sm font-medium text-primary">{t('Xem tất cả →')}</Link>} />
            <CardBody className="h-64">
              {data.topics.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topics.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} fontSize={12} />
                    <YAxis type="category" dataKey="topic" width={140} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="questions" name={t('Câu hỏi', { context: 'n' })} stackId="t" fill="#ea580c" />
                    <Bar dataKey="answers" name={t('Trả lời', { context: 'n' })} stackId="t" fill="#0f766e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title={t('Chưa có chủ đề')} />
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
