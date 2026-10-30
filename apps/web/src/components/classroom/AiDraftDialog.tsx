import { Bot, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AiAnswerOutput, AiProvider, PostDoc } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Field, Select, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/query';

interface RunResult {
  runId: string;
  provider: AiProvider;
  model: string;
  output: AiAnswerOutput;
  content: string;
  publishedPostId: string | null;
}

const PROVIDER_LABEL: Record<AiProvider, string> = { openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini' };

/** Lecturer workflow: AI drafts → lecturer edits → publish (labelled AI Generated) or discard. */
export function AiDraftDialog({
  open,
  onOpenChange,
  classId,
  sessionId,
  post,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classId: string;
  sessionId: string;
  post: PostDoc | null;
}) {
  const { t } = useTranslation();
  const status = useApi<{ enabled: boolean; providers: { provider: AiProvider; configured: boolean; enabled: boolean; model: string }[] }>(open ? '/ai/status' : null);
  const [provider, setProvider] = useState<AiProvider | ''>('');
  const [run, setRun] = useState<RunResult | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const generate = async () => {
    if (!post) return;
    setLoading(true);
    setError(null);
    if (run) await api.post(`/ai/runs/${run.runId}/reject`).catch(() => undefined);
    setRun(null);
    try {
      const r = await api.post<RunResult>('/ai/answer', { classId, sessionId, postId: post.postId, provider: provider || undefined });
      setRun(r);
      setText(r.content);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && post) {
      setRun(null);
      setText('');
      setError(null);
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.postId]);

  const publish = async () => {
    if (!run) return;
    setPublishing(true);
    try {
      await api.post(`/ai/runs/${run.runId}/publish`, { content: text });
      toast.success(t('Đã công bố câu trả lời (gắn nhãn AI Generated)'));
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (run) await api.post(`/ai/runs/${run.runId}/reject`).catch(() => undefined);
    onOpenChange(false);
  };

  const providers = status.data?.providers.filter((p) => p.enabled && p.configured) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(v) : void discard())}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-violet-600" /> {t('AI đề xuất trả lời')}
        </span>
      }
      description={t('Bản nháp do AI tạo. Hãy kiểm tra, chỉnh sửa trước khi công bố cho sinh viên.')}
      footer={
        <>
          <Button variant="outline" onClick={discard}>{t('Bỏ bản nháp')}</Button>
          <Button onClick={publish} loading={publishing} disabled={!run || !text.trim()}>
            {t('Duyệt và công bố')}
          </Button>
        </>
      }
    >
      {post && (
        <div className="mb-4 rounded-lg bg-surface-2 p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted">{t('Câu hỏi')}</p>
          <p className="mt-1 whitespace-pre-wrap">{post.content}</p>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label={t('Nhà cung cấp')} htmlFor="prov" className="min-w-[180px] flex-1">
          <Select id="prov" value={provider} onChange={(e) => setProvider(e.target.value as AiProvider | '')}>
            <option value="">{t('Mặc định của hệ thống')}</option>
            {providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {PROVIDER_LABEL[p.provider]} · {p.model}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="outline" onClick={generate} loading={loading}>
          <RefreshCw className="h-4 w-4" /> {t('Tạo lại')}
        </Button>
      </div>
      {loading && <Spinner label={t('AI đang soạn câu trả lời…')} />}
      {error && <Alert tone="danger" title={t('Không tạo được bản nháp')}>{error}</Alert>}
      {run && !loading && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="ai">AI Generated</Badge>
            <Badge>{PROVIDER_LABEL[run.provider]} · {run.model}</Badge>
          </div>
          {run.output.relatedConcepts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {run.output.relatedConcepts.map((c) => (
                <span key={c} className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700">{c}</span>
              ))}
            </div>
          )}
          <Field label={t('Nội dung sẽ công bố (có thể chỉnh sửa)')} htmlFor="ai-text">
            <Textarea id="ai-text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-[220px]" />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
