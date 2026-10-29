import { CheckCircle2, Tag } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { PostDoc, SessionDoc } from '@classinteract/shared';
import { POST_TYPE_LABELS } from '@classinteract/shared';
import { RoleBadge, StatusBadge } from '@/components/classroom/PostCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { cn, timeAgo } from '@/lib/utils';
import { useClassCtx } from './ClassLayout';
import type { TopicRow } from './ClassOverviewPage';

type Thread = PostDoc & { replies: PostDoc[] };

export function TopicsPage() {
  const { cls } = useClassCtx();
  const [sessionId, setSessionId] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const sessions = useApi<{ items: SessionDoc[] }>(`/classes/${cls.classId}/sessions`);
  const qs = `${sessionId ? `sessionId=${sessionId}&` : ''}${topic ? `topic=${encodeURIComponent(topic)}` : ''}`;
  const { data, isLoading, error } = useApi<{ topics: TopicRow[]; threads?: Thread[] }>(`/classes/${cls.classId}/analytics/topics?${qs}`);
  const [retag, setRetag] = useState<Thread | null>(null);
  const sessionNo = new Map((sessions.data?.items ?? []).map((s) => [s.sessionId, s]));
  const allTopics = [...new Set((sessions.data?.items ?? []).flatMap((s) => s.topics))];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title="Chủ đề kiến thức"
          actions={
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-8 w-auto text-xs" aria-label="Lọc buổi">
              <option value="">Mọi buổi</option>
              {sessions.data?.items.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>Buổi {s.sessionNumber}</option>
              ))}
            </Select>
          }
        />
        {isLoading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorState error={error} />
        ) : !data?.topics.length ? (
          <EmptyState icon={<Tag className="h-6 w-6" />} title="Chưa có dữ liệu chủ đề" description="Thêm chủ đề cho buổi học để sinh viên gắn vào câu hỏi." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Chủ đề</Th><Th className="text-right">Hỏi</Th><Th className="text-right">Đáp</Th><Th className="text-right">SV</Th><Th className="text-right">Chờ</Th></tr>
            </thead>
            <tbody>
              {data.topics.map((t) => (
                <tr key={t.topic} onClick={() => setTopic(t.topic)} className={cn('cursor-pointer hover:bg-slate-50', topic === t.topic && 'bg-primary-soft')}>
                  <Td className="font-medium">{t.topic}</Td>
                  <Td className="text-right tabular-nums">{t.questions}</Td>
                  <Td className="text-right tabular-nums">{t.answers}</Td>
                  <Td className="text-right tabular-nums">{t.participants}</Td>
                  <Td className={cn('text-right tabular-nums', t.openQuestions > 0 && 'font-semibold text-accent')}>{t.openQuestions}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="min-w-0 space-y-3">
        {!topic ? (
          <Card><EmptyState title="Chọn một chủ đề" description="Xem toàn bộ câu hỏi và câu trả lời của chủ đề đó qua các buổi học." /></Card>
        ) : isLoading ? (
          <Spinner />
        ) : (
          <>
            <h2 className="text-lg font-semibold">#{topic} <span className="text-sm font-normal text-muted">· {data?.threads?.length ?? 0} chủ đề thảo luận</span></h2>
            {data?.threads?.map((t) => (
              <Card key={t.postId}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge>{POST_TYPE_LABELS[t.type]}</Badge>
                    {t.type === 'question' && <StatusBadge status={t.status} />}
                    <span>Buổi {sessionNo.get(t.sessionId)?.sessionNumber ?? '?'} · {t.authorName} · {timeAgo(t.createdAt)} · ▲{t.voteCount}</span>
                    <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setRetag(t)}>
                      <Tag className="h-3.5 w-3.5" /> Đổi chủ đề
                    </Button>
                  </div>
                  <Link to={`/teach/classes/${cls.classId}/sessions/${t.sessionId}/posts/${t.postId}`} className="block whitespace-pre-wrap text-[15px] hover:text-primary">{t.content}</Link>
                  {t.replies.length > 0 && (
                    <ul className="space-y-2 border-l-2 border-border pl-3">
                      {t.replies.map((r) => (
                        <li key={r.postId} className={cn('text-sm', r.isAccepted && 'rounded-md bg-green-50 p-2')}>
                          <span className="mr-2 inline-flex items-center gap-1 font-medium">
                            {r.authorName} <RoleBadge post={r} />
                            {r.isAccepted && <CheckCircle2 className="h-4 w-4 text-success" />}
                          </span>
                          <span className="whitespace-pre-wrap text-slate-700">{r.content}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            ))}
          </>
        )}
      </div>
      <RetagDialog thread={retag} onClose={() => setRetag(null)} classId={cls.classId} suggestions={allTopics} />
    </div>
  );
}

function RetagDialog({ thread, onClose, classId, suggestions }: { thread: Thread | null; onClose: () => void; classId: string; suggestions: string[] }) {
  const [topics, setTopics] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (thread && thread.postId !== lastId) {
    setLastId(thread.postId);
    setTopics(thread.topics);
  }
  const toggle = (t: string) => setTopics((x) => (x.includes(t) ? x.filter((y) => y !== t) : x.length < 5 ? [...x, t] : x));
  const save = async () => {
    if (!thread) return;
    setSaving(true);
    try {
      await api.patch(`/classes/${classId}/sessions/${thread.sessionId}/posts/${thread.postId}/moderation`, { topics });
      await invalidate(`/classes/${classId}/analytics`);
      toast.success('Đã cập nhật chủ đề');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const options = [...new Set([...suggestions, ...topics])];
  return (
    <Dialog
      open={!!thread}
      onOpenChange={(v) => !v && onClose()}
      title="Chuyển chủ đề"
      description="Chọn tối đa 5 chủ đề cho bài đăng này. Câu trả lời đi theo chủ đề của câu hỏi."
      size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Hủy</Button><Button onClick={save} loading={saving}>Lưu</Button></>}
    >
      <div className="flex flex-wrap gap-1.5">
        {options.map((t) => (
          <button key={t} onClick={() => toggle(t)} aria-pressed={topics.includes(t)} className={cn('rounded-md px-2 py-1 text-xs font-medium', topics.includes(t) ? 'bg-secondary text-white' : 'bg-secondary-soft text-secondary')}>
            #{t}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Chủ đề mới" maxLength={80} />
        <Button variant="outline" onClick={() => { if (input.trim()) toggle(input.trim()); setInput(''); }}>Thêm</Button>
      </div>
    </Dialog>
  );
}
