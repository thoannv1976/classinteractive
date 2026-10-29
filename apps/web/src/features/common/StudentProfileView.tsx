import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ClassDoc, MemberDoc, PostType, QuestionStatus, StudentClassMetricsDoc, StudentSessionMetricsDoc, Time } from '@classinteract/shared';
import { POST_TYPE_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { StatCard } from '@/components/ui/misc';
import { StatusBadge } from '@/components/classroom/PostCard';
import { useApi } from '@/lib/query';
import { formatDateTime, pct } from '@/lib/utils';

export interface ProfileData {
  class: ClassDoc;
  member: MemberDoc;
  metrics: StudentClassMetricsDoc | null;
  derived: { attendanceRate: number | null; activityCompletionRate: number | null; quizAccuracy: number | null; consistency: number | null; interactions: number };
  sessions: { sessionId: string; sessionNumber: number; title: string; date: string; metrics: StudentSessionMetricsDoc | null }[];
  topics: string[];
  posts: {
    postId: string;
    sessionId: string;
    type: PostType;
    content: string;
    topics: string[];
    status: QuestionStatus | null;
    isAccepted: boolean;
    isAnonymous: boolean;
    moderationStatus: string;
    rootPostId: string | null;
    voteCount: number;
    replyCount: number;
    createdAt: Time;
  }[];
}

export function StudentProfileView({ classId, uid, linkBase }: { classId: string; uid: string; linkBase: string }) {
  const { data, isLoading, error } = useApi<ProfileData>(`/classes/${classId}/analytics/students/${uid}`);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;
  const m = data.metrics;
  const chart = data.sessions.map((s) => ({
    name: `B${s.sessionNumber}`,
    'Câu hỏi': s.metrics?.questions ?? 0,
    'Trả lời/Bình luận': (s.metrics?.answers ?? 0) + (s.metrics?.comments ?? 0) + (s.metrics?.reflections ?? 0),
    'Hoạt động': s.metrics?.activitiesCompleted ?? 0,
  }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Buổi tham gia" value={m?.sessionsJoined ?? 0} hint={`Tỷ lệ ${pct(data.derived.attendanceRate)}`} />
        <StatCard label="Câu hỏi" value={m?.questions ?? 0} tone="accent" />
        <StatCard label="Trả lời" value={m?.answers ?? 0} tone="secondary" />
        <StatCard label="Bình luận/Nhận xét" value={(m?.comments ?? 0) + (m?.reflections ?? 0)} tone="neutral" />
        <StatCard label="Hoạt động" value={m?.activitiesCompleted ?? 0} hint={`Hoàn thành ${pct(data.derived.activityCompletionRate)}`} />
        <StatCard label="Quiz đúng" value={pct(data.derived.quizAccuracy)} hint={`${m?.quizCorrect ?? 0}/${m?.quizzesAnswered ?? 0}`} tone="secondary" />
        <StatCard label="Được GV xác nhận" value={m?.acceptedAnswers ?? 0} tone="primary" />
        <StatCard label="Mức độ đều đặn" value={pct(data.derived.consistency)} hint="Tỷ lệ buổi có tương tác" tone="neutral" />
      </div>
      <Card>
        <CardHeader title="Xu hướng tham gia theo buổi" description="Chỉ tính các buổi đã diễn ra" />
        <CardBody>
          {chart.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Câu hỏi" stackId="a" fill="#ea580c" />
                  <Bar dataKey="Trả lời/Bình luận" stackId="a" fill="#0f766e" />
                  <Bar dataKey="Hoạt động" stackId="a" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Chưa có buổi học nào diễn ra" />
          )}
        </CardBody>
      </Card>
      {data.topics.length > 0 && (
        <Card>
          <CardHeader title="Chủ đề đã tham gia" />
          <CardBody className="flex flex-wrap gap-2">
            {data.topics.map((t) => (
              <span key={t} className="rounded-md bg-secondary-soft px-2 py-1 text-sm font-medium text-secondary">#{t}</span>
            ))}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Lịch sử đóng góp" description={`${data.posts.length} bài đăng`} />
        <CardBody className="p-0 sm:p-0">
          {data.posts.length ? (
            <ul className="divide-y divide-border">
              {data.posts.map((p) => {
                const thread = p.rootPostId ?? p.postId;
                const session = data.sessions.find((s) => s.sessionId === p.sessionId);
                return (
                  <li key={p.postId} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge>{POST_TYPE_LABELS[p.type]}</Badge>
                      {p.type === 'question' && <StatusBadge status={p.status} />}
                      {p.isAccepted && <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> GV xác nhận</Badge>}
                      {p.isAnonymous && <Badge>Ẩn danh</Badge>}
                      {p.moderationStatus !== 'visible' && <Badge tone="danger">Đã ẩn</Badge>}
                      <span>{session ? `Buổi ${session.sessionNumber}` : ''} · {formatDateTime(p.createdAt)}</span>
                    </div>
                    <Link to={`${linkBase}/sessions/${p.sessionId}/posts/${thread}`} className="mt-1 line-clamp-2 block text-sm hover:text-primary">
                      {p.content}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Chưa có bài đăng" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
