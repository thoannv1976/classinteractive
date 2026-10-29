import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AiProvider, AiSettingsDoc } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, ErrorState, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { PageHeader, Table, Td, Th } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { formatDateTime } from '@/lib/utils';
import type { Time } from '@classinteract/shared';

const NAMES: Record<AiProvider, string> = { anthropic: 'Anthropic Claude', openai: 'OpenAI', gemini: 'Google Gemini' };
const SECRET: Record<AiProvider, string> = { anthropic: 'anthropic-api-key', openai: 'openai-api-key', gemini: 'gemini-api-key' };

interface Usage {
  months: { month: string; costUsd: number; runs: number }[];
  recentRuns: { runId: string; provider: AiProvider | null; model: string | null; status: string; approvalStatus: string; tokenUsage: { input: number; output: number }; estimatedCost: number; requestedByRole: string; error: string | null; createdAt: Time }[];
}

export function AiConfigPage() {
  const { data, isLoading, error } = useApi<{ settings: AiSettingsDoc; providers: { provider: AiProvider; configured: boolean; fake: boolean }[] }>('/admin/settings/ai');
  const usage = useApi<Usage>('/admin/ai-usage');
  const [s, setS] = useState<AiSettingsDoc | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);
  if (isLoading || !s) return error ? <ErrorState error={error} /> : <Spinner />;

  const save = async () => {
    setSaving(true);
    try {
      const { updatedAt: _u, updatedBy: _b, ...body } = s;
      await api.put('/admin/settings/ai', body);
      await invalidate('/admin/settings', '/ai/status');
      toast.success('Đã lưu cấu hình AI');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const setProv = (p: AiProvider, patch: Partial<AiSettingsDoc['providers'][AiProvider]>) => setS({ ...s, providers: { ...s.providers, [p]: { ...s.providers[p], ...patch } } });
  const configured = new Map(data!.providers.map((p) => [p.provider, p]));

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Cấu hình AI" description="Ứng dụng gọi AI qua backend. API key lưu trong Google Cloud Secret Manager, không bao giờ gửi tới trình duyệt." />
      {data!.providers.some((p) => p.fake) && <Alert tone="warning">Đang chạy chế độ AI mô phỏng (AI_FAKE_PROVIDER=1) – dùng cho kiểm thử.</Alert>}
      <Card>
        <CardHeader title="Chung" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Switch id="en" checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} label="Bật AI trên toàn hệ thống" description="Tắt để dừng mọi lời gọi AI. Các chức năng lớp học vẫn hoạt động bình thường." /></div>
          <Field label="Nhà cung cấp mặc định" htmlFor="def">
            <Select id="def" value={s.defaultProvider} onChange={(e) => setS({ ...s, defaultProvider: e.target.value as AiProvider })}>
              {(Object.keys(NAMES) as AiProvider[]).map((p) => <option key={p} value={p}>{NAMES[p]}</option>)}
            </Select>
          </Field>
          <Field label="Thứ tự dự phòng khi lỗi" htmlFor="fb" hint="Thử lần lượt nếu nhà cung cấp trước gặp lỗi">
            <Select id="fb" value={s.fallbackOrder.join(',')} onChange={(e) => setS({ ...s, fallbackOrder: e.target.value.split(',') as AiProvider[] })}>
              {['anthropic,openai,gemini', 'openai,anthropic,gemini', 'gemini,anthropic,openai', 'anthropic,gemini,openai', 'openai,gemini,anthropic', 'gemini,openai,anthropic'].map((o) => (
                <option key={o} value={o}>{o.split(',').map((x) => NAMES[x as AiProvider]).join(' → ')}</option>
              ))}
            </Select>
          </Field>
          <Field label="Giới hạn token đầu ra" htmlFor="mt"><Input id="mt" type="number" min={100} max={8000} value={s.maxOutputTokens} onChange={(e) => setS({ ...s, maxOutputTokens: Number(e.target.value) })} /></Field>
          <Field label="Thời gian chờ (ms)" htmlFor="to"><Input id="to" type="number" min={5000} max={120000} step={1000} value={s.timeoutMs} onChange={(e) => setS({ ...s, timeoutMs: Number(e.target.value) })} /></Field>
          <Field label="Hạn mức chi phí/tháng (USD)" htmlFor="cl" hint="Vượt hạn mức: AI tạm dừng tới tháng sau"><Input id="cl" type="number" min={0} value={s.monthlyCostLimitUsd} onChange={(e) => setS({ ...s, monthlyCostLimitUsd: Number(e.target.value) })} /></Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Nhà cung cấp và mô hình" description="Đổi mô hình ở đây, không cần sửa mã nguồn. Đơn giá dùng để ước tính chi phí." />
        <CardBody className="space-y-5">
          {(Object.keys(NAMES) as AiProvider[]).map((p) => {
            const c = configured.get(p);
            return (
              <div key={p} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{NAMES[p]}</span>
                    {c?.configured ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Đã có API key</Badge> : <Badge tone="danger"><XCircle className="h-3 w-3" /> Chưa có secret {SECRET[p]}</Badge>}
                  </div>
                  <Switch id={`pe-${p}`} checked={s.providers[p].enabled} onCheckedChange={(v) => setProv(p, { enabled: v })} label="Sử dụng" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Model ID" htmlFor={`m-${p}`}><Input id={`m-${p}`} value={s.providers[p].model} onChange={(e) => setProv(p, { model: e.target.value })} className="font-mono text-xs" /></Field>
                  <Field label="USD / 1M token vào" htmlFor={`i-${p}`}><Input id={`i-${p}`} type="number" step="0.01" min={0} value={s.providers[p].inputCostPerMTok} onChange={(e) => setProv(p, { inputCostPerMTok: Number(e.target.value) })} /></Field>
                  <Field label="USD / 1M token ra" htmlFor={`o-${p}`}><Input id={`o-${p}`} type="number" step="0.01" min={0} value={s.providers[p].outputCostPerMTok} onChange={(e) => setProv(p, { outputCostPerMTok: Number(e.target.value) })} /></Field>
                </div>
              </div>
            );
          })}
          <div className="flex justify-end"><Button onClick={save} loading={saving}>Lưu cấu hình</Button></div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Lịch sử sử dụng AI" description={usage.data?.months.map((m) => `${m.month}: ${m.runs} lượt · $${(m.costUsd ?? 0).toFixed(2)}`).join(' | ')} />
        {usage.data?.recentRuns.length ? (
          <Table>
            <thead><tr><Th>Thời gian</Th><Th>Nhà cung cấp</Th><Th>Mô hình</Th><Th>Trạng thái</Th><Th>Duyệt</Th><Th className="text-right">Token</Th><Th className="text-right">Chi phí</Th></tr></thead>
            <tbody>
              {usage.data.recentRuns.map((r) => (
                <tr key={r.runId}>
                  <Td className="text-xs">{formatDateTime(r.createdAt)}</Td>
                  <Td>{r.provider ? NAMES[r.provider] : '—'}</Td>
                  <Td className="font-mono text-xs">{r.model ?? '—'}</Td>
                  <Td><Badge tone={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'neutral'} title={r.error ?? undefined}>{r.status}</Badge></Td>
                  <Td className="text-xs">{r.approvalStatus}</Td>
                  <Td className="text-right text-xs tabular-nums">{r.tokenUsage.input}/{r.tokenUsage.output}</Td>
                  <Td className="text-right text-xs tabular-nums">${r.estimatedCost.toFixed(4)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardBody><p className="text-sm text-muted">Chưa có lượt sử dụng.</p></CardBody>
        )}
      </Card>
    </div>
  );
}
