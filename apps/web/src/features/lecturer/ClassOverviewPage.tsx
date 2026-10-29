import { Activity, MessageCircleQuestion, MessagesSquare, UserCheck, UserX, Users } from 'lucide-react';
import { useEffect } from 'react';
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
  const { cls } = useClassCtx();
  const { data, isLoading, error } = useApi<Overview>(`/classes/${cls.classId}/analytics/overview`);
  const [params] = useSearchParams();
  const printMode = params.get('print') === '1';
  useEffect(() => {
    if (printMode && data) {
      const t = setTimeout(() => window.print(), 1200);
      return () => clearTimeout(t);
    }
  }, [printMode, data]);
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} />;
  const held = data.sessions.filter((s) => s.status !== 'draft');
  const chart = held.map((s) => ({
    name: `B${s.sessionNumber}`,
    'Câu hỏi': s.stats?.questionCount ?? 0,
    'Trả lời': s.stats?.answerCount ?? 0,
    'Bình luận': (s.stats?.commentCount ?? 0) + (s.stats?.reflectionCount ?? 0),
    'SV tham gia': s.stats?.attendeeCount ?? 0,
    'SV có tương tác': s.stats?.interactedCount ?? 0,
  }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Sinh viên" value={data.totals.students} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Có ít nhất 1 tương tác" value={pct(data.totals.interactionRate)} hint={`${data.totals.interacted} sinh viên`} icon={<UserCheck className="h-4 w-4" />} tone="secondary" />
        <StatCard label="Chưa tương tác" value={data.totals.notInteracted} icon={<UserX className="h-4 w-4" />} tone="neutral" />
        <StatCard label="Câu hỏi / Trả lời" value={`${data.stats?.questionCount ?? 0} / ${data.stats?.answerCount ?? 0}`} icon={<MessagesSquare className="h-4 w-4" />} tone="primary" />
        <StatCard label="Chưa giải đáp" value={data.stats?.openQuestionCount ?? 0} icon={<MessageCircleQuestion className="h-4 w-4" />} tone="accent" />
        <StatCard label="Hoạt động · hoàn thành" value={`${data.stats?.activityCount ?? 0} · ${pct(data.totals.completionRate)}`} hint="Tính trên SV có mặt" icon={<Activity className="h-4 w-4" />} tone="secondary" />
      </div>
      {!held.length ? (
        <Card>
          <EmptyState title="Chưa có buổi học nào diễn ra" description="Số liệu sẽ xuất hiện sau khi bạn bắt đầu buổi học đầu tiên." action={<Link to="sessions" className="text-sm font-medium text-primary">Đến danh sách buổi học →</Link>} />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Tương tác theo buổi học" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Câu hỏi" fill="#ea580c" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Trả lời" fill="#0f766e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Bình luận" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Sinh viên tham gia qua các buổi" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="SV tham gia" stroke="#1d4ed8" strokeWidth={2} />
                  <Line type="monotone" dataKey="SV có tương tác" stroke="#ea580c" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Phân bố mức độ tương tác" description="Số sinh viên theo tổng số tương tác trong học kỳ" />
            <CardBody className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.distribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" name="Sinh viên" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Chủ đề được quan tâm nhiều nhất" actions={<Link to="topics" className="text-sm font-medium text-primary">Xem tất cả →</Link>} />
            <CardBody className="h-64">
              {data.topics.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topics.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} fontSize={12} />
                    <YAxis type="category" dataKey="topic" width={140} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="questions" name="Câu hỏi" stackId="t" fill="#ea580c" />
                    <Bar dataKey="answers" name="Trả lời" stackId="t" fill="#0f766e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="Chưa có chủ đề" />
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
