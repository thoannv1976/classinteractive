import { Eye, EyeOff, KeyRound, PlugZap, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AiProvider, Time } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { invalidate } from '@/lib/query';
import { cn, formatDateTime } from '@/lib/utils';

export interface KeyStatus {
  provider: AiProvider;
  configured: boolean;
  source: 'store' | 'env' | 'none';
  last4: string | null;
  updatedAt: Time | null;
}

/**
 * API key input for one provider. The key is sent once to the server (stored in Secret Manager)
 * and never shown again – only the last 4 characters.
 */
export function ApiKeyField({ provider, status }: { provider: AiProvider; status: KeyStatus | undefined }) {
  const { t } = useTranslation();
  const me = useMe();
  const canEdit = me.role === 'superadmin';
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (apiKey: string) => {
    setBusy(apiKey ? 'save' : 'remove');
    try {
      await api.put(`/admin/settings/ai/keys/${provider}`, { apiKey });
      await invalidate('/admin/settings', '/ai/status');
      setValue('');
      setTest(null);
      toast.success(apiKey ? t('Đã lưu API key vào Secret Manager') : t('Đã xóa API key'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirmRemove(false);
    }
  };

  const runTest = async () => {
    setBusy('test');
    try {
      const r = await api.post<{ ok: boolean; model?: string; latencyMs: number; error?: string }>(`/admin/settings/ai/keys/${provider}/test`);
      setTest(
        r.ok
          ? { ok: true, text: t('Kết nối thành công · {{model}} · {{ms}} ms', { model: r.model ?? '', ms: r.latencyMs }) }
          : { ok: false, text: t('Kết nối thất bại: {{error}}', { error: r.error ?? '' }) },
      );
    } catch (e) {
      setTest({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 rounded-lg bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-muted" /> {t('API key')}
          {status?.configured ? (
            <span className="font-mono text-xs text-muted">
              ••••{status.last4}
              {status.source === 'env' && ` · ${t('nạp khi triển khai')}`}
              {status.updatedAt && ` · ${t('cập nhật {{time}}', { time: formatDateTime(status.updatedAt) })}`}
            </span>
          ) : (
            <span className="text-xs text-danger">{t('Chưa có API key')}</span>
          )}
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={runTest} loading={busy === 'test'} disabled={!status?.configured}>
            <PlugZap className="h-4 w-4" /> {t('Kiểm tra kết nối')}
          </Button>
          {canEdit && status?.source === 'store' && (
            <Button size="icon-sm" variant="ghost" aria-label={t('Xóa API key')} onClick={() => setConfirmRemove(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {canEdit ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) void save(value.trim());
          }}
        >
          <div className="relative flex-1">
            <Input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={status?.configured ? t('Dán key mới để thay thế') : t('Dán API key')}
              autoComplete="off"
              spellCheck={false}
              className="pr-10 font-mono text-xs"
              aria-label={t('API key')}
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-0 px-3 text-muted" aria-label={show ? t('Ẩn') : t('Hiện')}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button type="submit" size="md" loading={busy === 'save'} disabled={!value.trim()}>
            {t('Lưu key')}
          </Button>
        </form>
      ) : (
        <p className="mt-2 text-xs text-muted">{t('Chỉ quản trị cấp cao được nhập hoặc thay API key.')}</p>
      )}
      {test && <p className={cn('mt-2 text-xs', test.ok ? 'text-success' : 'text-danger')}>{test.text}</p>}
      <p className="mt-2 text-xs text-muted">{t('Key được lưu mã hóa trong Google Cloud Secret Manager, không bao giờ hiển thị lại. Có hiệu lực trong khoảng 1 phút.')}</p>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t('Xóa API key?')}
        description={t('Ứng dụng sẽ ngừng gọi nhà cung cấp này cho tới khi có key mới.')}
        danger
        confirmLabel={t('Xóa')}
        loading={busy === 'remove'}
        onConfirm={() => save('')}
      />
    </div>
  );
}
