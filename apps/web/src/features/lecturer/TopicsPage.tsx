import { CheckCircle2, Tag } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          title={t('Chủ đề kiến thức')}
          actions={
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-8 w-auto text-xs" aria-label={t('Lọc buổi')}>
              <option value="">{t('Mọi buổi')}</option>
              {sessions.data?.items.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>{t('Buổi {{n}}', { n: s.sessionNumber })}</option>
              ))}
            </Select>
          }
        />
        {isLoading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorState error={error} />
        ) : !data?.topics.length ? (
          <EmptyState icon={<Tag className="h-6 w-6" />} title={t('Chưa có dữ liệu chủ đề')} description={t('Thêm chủ đề cho buổi học để sinh viên gắn vào câu hỏi.')} />
        ) : (
          <Table>
            <thead>
              <tr><Th>{t('Chủ đề')}</Th><Th className="text-right">{t('Hỏi')}</Th><Th className="text-right">{t('Đáp')}</Th><Th className="text-right">{t('SV')}</Th><Th className="text-right">{t('Chờ')}</Th></tr>
            </thead>
            <tbody>
              {data.topics.map((row) => (
                <tr key={row.topic} onClick={() => setTopic(row.topic)} className={cn('cursor-pointer hover:bg-slate-50', topic === row.topic && 'bg-primary-soft')}>
                  <Td className="font-medium">{row.topic}</Td>
                  <Td className="text-right tabular-nums">{row.questions}</Td>
                  <Td className="text-right tabular-nums">{row.answers}</Td>
                  <Td className="text-right tabular-nums">{row.participants}</Td>
                  <Td className={cn('text-right tabular-nums', row.openQuestions > 0 && 'font-semibold text-accent')}>{row.openQuestions}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="min-w-0 space-y-3">
        {!topic ? (
          <Card><EmptyState title={t('Chọn một chủ đề')} description={t('Xem toàn bộ câu hỏi và câu trả lời của chủ đề đó qua các buổi học.')} /></Card>
        ) : isLoading ? (
          <Spinner />
        ) : (
          <>
            <h2 className="text-lg font-semibold">#{topic} <span className="text-sm font-normal text-muted">· {t('{{count}} chủ đề thảo luận', { count: data?.threads?.length ?? 0 })}</span></h2>
            {data?.threads?.map((th) => (
              <Card key={th.postId}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge>{t(POST_TYPE_LABELS[th.type])}</Badge>
                    {th.type === 'question' && <StatusBadge status={th.status} />}
                    <span>{t('Buổi {{n}}', { n: sessionNo.get(th.sessionId)?.sessionNumber ?? '?' })} · {th.authorName} · {timeAgo(th.createdAt)} · ▲{th.voteCount}</span>
                    <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setRetag(th)}>
                      <Tag className="h-3.5 w-3.5" /> {t('Đổi chủ đề')}
                    </Button>
                  </div>
                  <Link to={`/teach/classes/${cls.classId}/sessions/${th.sessionId}/posts/${th.postId}`} className="block whitespace-pre-wrap text-[15px] hover:text-primary">{th.content}</Link>
                  {th.replies.length > 0 && (
                    <ul className="space-y-2 border-l-2 border-border pl-3">
                      {th.replies.map((r) => (
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
  const { t } = useTranslation();
  const [topics, setTopics] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (thread && thread.postId !== lastId) {
    setLastId(thread.postId);
    setTopics(thread.topics);
  }
  const toggle = (tp: string) => setTopics((x) => (x.includes(tp) ? x.filter((y) => y !== tp) : x.length < 5 ? [...x, tp] : x));
  const save = async () => {
    if (!thread) return;
    setSaving(true);
    try {
      await api.patch(`/classes/${classId}/sessions/${thread.sessionId}/posts/${thread.postId}/moderation`, { topics });
      await invalidate(`/classes/${classId}/analytics`);
      toast.success(t('Đã cập nhật chủ đề'));
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
      title={t('Chuyển chủ đề')}
      description={t('Chọn tối đa 5 chủ đề cho bài đăng này. Câu trả lời đi theo chủ đề của câu hỏi.')}
      size="sm"
      footer={<><Button variant="outline" onClick={onClose}>{t('Hủy')}</Button><Button onClick={save} loading={saving}>{t('Lưu')}</Button></>}
    >
      <div className="flex flex-wrap gap-1.5">
        {options.map((tp) => (
          <button key={tp} onClick={() => toggle(tp)} aria-pressed={topics.includes(tp)} className={cn('rounded-md px-2 py-1 text-xs font-medium', topics.includes(tp) ? 'bg-secondary text-white' : 'bg-secondary-soft text-secondary')}>
            #{tp}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('Chủ đề mới')} maxLength={80} />
        <Button variant="outline" onClick={() => { if (input.trim()) toggle(input.trim()); setInput(''); }}>{t('Thêm')}</Button>
      </div>
    </Dialog>
  );
}
