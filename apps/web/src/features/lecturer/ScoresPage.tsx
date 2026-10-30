import { ArrowDown, ArrowUp, CheckCircle2, Download, Info, Pencil, Search, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ScoreComponent, ScoreConfig, Time } from '@classinteract/shared';
import { SCORE_COMPONENTS, SCORE_COMPONENT_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { tk } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { cn, formatDateTime } from '@/lib/utils';
import { useClassCtx } from './ClassLayout';

interface ComponentResult {
  value: number | null;
  done: number;
  possible: number;
}

export interface ScoreRow {
  uid: string;
  studentId: string | null;
  displayName: string;
  components: Record<ScoreComponent, ComponentResult>;
  raw: number | null;
  adjustment: number;
  score: number | null;
  sessionsCounted: number;
  adjustmentNote?: string;
}

interface SnapshotMeta {
  snapshotId: string;
  configVersion: number;
  sessionsHeld: number;
  confirmedBy: string;
  confirmedByName: string;
  confirmedAt: Time;
  rows?: unknown[];
}

interface ScoresData {
  config: ScoreConfig;
  rows: ScoreRow[];
  sessionsHeld: number;
  lastSnapshot: SnapshotMeta | null;
}

/** Short column headers (full labels come from SCORE_COMPONENT_LABELS). */
export const SCORE_SHORT_LABELS: Record<ScoreComponent, string> = {
  activities: tk('Hoạt động'),
  answers: tk('Trả lời/thảo luận'),
  questions: tk('Đặt câu hỏi'),
  helpful: tk('Phản hồi có ích'),
  exitTickets: tk('Phiếu cuối buổi'),
};

const fmtPct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const fmtScore = (v: number | null) => (v === null ? '—' : v.toFixed(1));

type SortKey = 'studentId' | 'displayName' | 'score';

export function ScoresPage() {
  const { t } = useTranslation();
  const { cls, access, refetch } = useClassCtx();
  const base = `/classes/${cls.classId}`;
  const { data, isLoading, error, refetch: refetchScores } = useApi<ScoresData>(`${base}/scores`);
  const snaps = useApi<{ items: SnapshotMeta[] }>(`${base}/scores/snapshots`);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'studentId', dir: 1 });
  const [cfgOpen, setCfgOpen] = useState(false);
  const [adjFor, setAdjFor] = useState<ScoreRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [togglingShow, setTogglingShow] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) r = r.filter((x) => `${x.studentId ?? ''} ${x.displayName}`.toLowerCase().includes(needle));
    return [...r].sort((a, b) => {
      const va = sort.key === 'score' ? (a.score ?? -1) : (a[sort.key] ?? '');
      const vb = sort.key === 'score' ? (b.score ?? -1) : (b[sort.key] ?? '');
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [data, q, sort]);

  const th = (key: SortKey, label: string, right = false) => (
    <Th className={right ? 'text-right' : undefined} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'score' ? -1 : 1 }))}>
      <span className={cn('inline-flex items-center gap-1', right && 'justify-end')}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </Th>
  );

  const toggleShow = async (v: boolean) => {
    setTogglingShow(true);
    try {
      await api.patch(base, { settings: { showScoreToStudents: v } });
      await invalidate('/classes', '/teach');
      refetch();
      toast.success(v ? t('Sinh viên đã có thể xem điểm tham khảo của mình') : t('Đã ẩn điểm tham khảo với sinh viên'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTogglingShow(false);
    }
  };

  const confirmScores = async () => {
    setConfirming(true);
    try {
      await api.post(`${base}/scores/confirm`);
      await invalidate(`${base}/scores`);
      toast.success(t('Đã xác nhận điểm'));
      setConfirmOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConfirming(false);
    }
  };

  const exportXlsx = async () => {
    setDownloading(true);
    try {
      await api.download(`${base}/export?format=xlsx`, `${cls.classCode}.xlsx`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetchScores()} />;
  const cfg = data.config;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-primary-soft/60 px-4 py-3 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1.5">
          <p>
            {t('Điểm tham gia là điểm tham khảo (0–100), chỉ tính trên các cơ hội thực sự đã diễn ra: {{n}} buổi học đã tổ chức và các hoạt động đã mở. Thành phần nào chưa có cơ hội sẽ được bỏ qua và trọng số của các thành phần còn lại được chia lại, nên một buổi không có hoạt động không làm giảm điểm của ai.', { n: data.sessionsHeld })}
          </p>
          <p>
            {t('Để chống spam, mỗi buổi chỉ tính tối đa {{answers}} trả lời/thảo luận, {{questions}} câu hỏi và {{helpful}} phản hồi có ích.', { answers: cfg.caps.answers, questions: cfg.caps.questions, helpful: cfg.caps.helpful })}{' '}
            <strong>{t('Đây không phải điểm chính thức cho đến khi giảng viên xác nhận điểm.')}</strong>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Badge tone="primary">{t('Phiên bản công thức {{v}}', { v: cfg.version })}</Badge>
            <span>{cfg.basis === 'attended' ? t('Tính trên các buổi sinh viên có mặt') : t('Tính trên tất cả các buổi đã diễn ra')}</span>
            {SCORE_COMPONENTS.map((k) => (
              <span key={k}>
                {t(SCORE_COMPONENT_LABELS[k])}: <strong>{cfg.weights[k]}%</strong>
              </span>
            ))}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title={t('Điểm tham gia của sinh viên')}
          description={data.lastSnapshot ? t('Lần xác nhận gần nhất: {{at}} bởi {{by}} (phiên bản {{v}})', { at: formatDateTime(data.lastSnapshot.confirmedAt), by: data.lastSnapshot.confirmedByName, v: data.lastSnapshot.configVersion }) : t('Chưa xác nhận lần nào')}
          actions={
            access.canManage && (
              <>
                <Button variant="outline" onClick={() => setCfgOpen(true)}>
                  <Settings2 className="h-4 w-4" /> {t('Cấu hình công thức')}
                </Button>
                <Button onClick={() => setConfirmOpen(true)}>
                  <CheckCircle2 className="h-4 w-4" /> {t('Xác nhận điểm')}
                </Button>
              </>
            )
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Tìm mã SV, họ tên')} className="pl-9" aria-label={t('Tìm sinh viên')} />
          </div>
          <div className="min-w-[260px] max-w-md">
            <Switch
              id="show-score"
              checked={!!cls.settings.showScoreToStudents}
              onCheckedChange={(v) => void toggleShow(v)}
              disabled={!access.canManage || togglingShow}
              label={t('Cho sinh viên xem điểm tham khảo của mình')}
            />
          </div>
        </div>
        <CardBody className="p-0 pt-3 sm:p-0 sm:pt-3">
          {!rows.length ? (
            <EmptyState title={t('Chưa có sinh viên')} />
          ) : (
            <Table>
              <thead>
                <tr>
                  {th('studentId', t('Mã SV'))}
                  {th('displayName', t('Họ tên'))}
                  {SCORE_COMPONENTS.map((k) => (
                    <Th key={k} className="text-right">
                      <span title={t(SCORE_COMPONENT_LABELS[k])}>{t(SCORE_SHORT_LABELS[k])}</span>
                      <span className="ml-1 font-normal normal-case">({cfg.weights[k]}%)</span>
                    </Th>
                  ))}
                  <Th className="text-right">{t('Điều chỉnh')}</Th>
                  {th('score', t('Điểm'), true)}
                  {access.canManage && <Th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid} className="hover:bg-slate-50">
                    <Td className="font-mono text-xs">{r.studentId ?? '—'}</Td>
                    <Td className="font-medium">{r.displayName}</Td>
                    {SCORE_COMPONENTS.map((k) => {
                      const c = r.components[k];
                      return (
                        <Td key={k} className={cn('text-right tabular-nums', c.value === null && 'text-muted')}>
                          <span title={c.possible > 0 ? `${c.done}/${c.possible}` : t('Chưa có cơ hội')}>{fmtPct(c.value)}</span>
                        </Td>
                      );
                    })}
                    <Td className="text-right tabular-nums">
                      {r.adjustment ? (
                        <span className={r.adjustment > 0 ? 'text-success' : 'text-danger'} title={r.adjustmentNote || undefined}>
                          {r.adjustment > 0 ? '+' : ''}
                          {r.adjustment}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-right font-semibold tabular-nums">
                      <span title={r.score === null ? t('Chưa có cơ hội tham gia nào') : undefined}>{fmtScore(r.score)}</span>
                    </Td>
                    {access.canManage && (
                      <Td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setAdjFor(r)} aria-label={t('Điều chỉnh điểm của {{name}}', { name: r.displayName })}>
                          <Pencil className="h-3.5 w-3.5" /> {t('Điều chỉnh')}
                        </Button>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('Các lần xác nhận điểm')}
          description={t('Sheet "Engagement Scores" trong file Excel xuất ra có điểm đã xác nhận gần nhất.')}
          actions={
            <Button variant="outline" onClick={exportXlsx} loading={downloading}>
              <Download className="h-4 w-4" /> {t('Xuất Excel')}
            </Button>
          }
        />
        {snaps.data?.items.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Thời gian xác nhận')}</Th>
                <Th>{t('Người xác nhận')}</Th>
                <Th>{t('Phiên bản công thức')}</Th>
                <Th className="text-right">{t('Số buổi')}</Th>
                <Th className="text-right">{t('Sinh viên', { context: 'n' })}</Th>
              </tr>
            </thead>
            <tbody>
              {snaps.data.items.map((s) => (
                <tr key={s.snapshotId}>
                  <Td className="text-xs">{formatDateTime(s.confirmedAt)}</Td>
                  <Td>{s.confirmedByName}</Td>
                  <Td>v{s.configVersion}</Td>
                  <Td className="text-right tabular-nums">{s.sessionsHeld}</Td>
                  <Td className="text-right tabular-nums">{s.rows?.length ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardBody>
            <p className="text-sm text-muted">{snaps.isLoading ? t('Đang tải…') : t('Chưa xác nhận lần nào')}</p>
          </CardBody>
        )}
      </Card>

      {cfgOpen && <ConfigDialog base={base} config={cfg} onClose={() => setCfgOpen(false)} />}
      {adjFor && <AdjustDialog base={base} row={adjFor} onClose={() => setAdjFor(null)} />}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Xác nhận điểm')}
        confirmLabel={t('Xác nhận điểm')}
        loading={confirming}
        onConfirm={() => void confirmScores()}
      >
        <p className="text-sm text-muted">
          {t('Điểm hiện tại của {{n}} sinh viên sẽ được lưu thành một bản chốt kèm phiên bản công thức {{v}}. Bản chốt này là điểm chính thức có thể xuất ra Excel; điểm tham khảo vẫn tiếp tục cập nhật.', { n: data.rows.length, v: cfg.version })}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function ConfigDialog({ base, config, onClose }: { base: string; config: ScoreConfig; onClose: () => void }) {
  const { t } = useTranslation();
  const [weights, setWeights] = useState<Record<ScoreComponent, number>>({ ...config.weights });
  const [caps, setCaps] = useState({ ...config.caps });
  const [basis, setBasis] = useState<ScoreConfig['basis']>(config.basis);
  const [saving, setSaving] = useState(false);
  const sum = SCORE_COMPONENTS.reduce((a, k) => a + (weights[k] || 0), 0);
  const capsOk = Object.values(caps).every((c) => Number.isInteger(c) && c >= 1 && c <= 20);
  const weightsOk = SCORE_COMPONENTS.every((k) => Number.isInteger(weights[k]) && weights[k] >= 0 && weights[k] <= 100);
  const valid = sum === 100 && capsOk && weightsOk;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put<{ version: number }>(`${base}/score-config`, { weights, caps, basis });
      await invalidate(`${base}/scores`);
      toast.success(t('Đã lưu công thức – phiên bản {{v}}', { v: r.version }));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const capField = (k: keyof ScoreConfig['caps'], label: string) => (
    <Field label={label} htmlFor={`cap-${k}`}>
      <Input id={`cap-${k}`} type="number" min={1} max={20} step={1} value={caps[k]} onChange={(e) => setCaps({ ...caps, [k]: Number(e.target.value) })} aria-invalid={!(caps[k] >= 1 && caps[k] <= 20)} />
    </Field>
  );

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('Cấu hình công thức')}
      description={t('Đang dùng phiên bản công thức {{v}}. Mỗi lần lưu tạo một phiên bản mới; các bản chốt cũ giữ nguyên phiên bản đã dùng.', { v: config.version })}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={() => void save()} loading={saving} disabled={!valid}>{t('Lưu công thức')}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('Trọng số (%)')}</h3>
            <Badge tone={sum === 100 ? 'success' : 'danger'}>{t('Tổng: {{sum}}/100', { sum })}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SCORE_COMPONENTS.map((k) => (
              <Field key={k} label={t(SCORE_COMPONENT_LABELS[k])} htmlFor={`w-${k}`}>
                <Input id={`w-${k}`} type="number" min={0} max={100} step={1} value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
          {sum !== 100 && <p className="mt-2 text-xs text-danger" role="alert">{t('Tổng trọng số phải bằng 100%')}</p>}
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t('Giới hạn mỗi buổi')}</h3>
          <p className="mb-2 text-xs text-muted">{t('Số đóng góp tối đa được tính trong một buổi (1–20), để tránh spam.')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {capField('answers', t('Trả lời/thảo luận'))}
            {capField('questions', t('Đặt câu hỏi'))}
            {capField('helpful', t('Phản hồi có ích'))}
          </div>
        </div>
        <Field label={t('Buổi học được tính')} htmlFor="basis">
          <Select id="basis" value={basis} onChange={(e) => setBasis(e.target.value as ScoreConfig['basis'])}>
            <option value="held">{t('Tất cả các buổi đã diễn ra')}</option>
            <option value="attended">{t('Chỉ các buổi sinh viên có mặt')}</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function AdjustDialog({ base, row, onClose }: { base: string; row: ScoreRow; onClose: () => void }) {
  const { t } = useTranslation();
  const [delta, setDelta] = useState<number>(row.adjustment ?? 0);
  const [note, setNote] = useState(row.adjustmentNote ?? '');
  const [saving, setSaving] = useState(false);
  const valid = Number.isFinite(delta) && delta >= -100 && delta <= 100 && note.length <= 500;

  const submit = async (d: number, n: string) => {
    setSaving(true);
    try {
      await api.put(`${base}/score-adjustments/${row.uid}`, { delta: d, note: n.trim() });
      await invalidate(`${base}/scores`);
      toast.success(d === 0 && !n.trim() ? t('Đã xóa điều chỉnh') : t('Đã lưu điều chỉnh'));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('Điều chỉnh điểm')}
      description={`${row.studentId ?? ''} · ${row.displayName}`}
      footer={
        <>
          {(row.adjustment !== 0 || row.adjustmentNote) && (
            <Button variant="danger-outline" onClick={() => void submit(0, '')} disabled={saving} className="mr-auto">
              {t('Xóa điều chỉnh')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={() => void submit(delta, note)} loading={saving} disabled={!valid}>{t('Lưu')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {t('Điểm theo công thức: {{raw}}. Điểm sau điều chỉnh được giới hạn trong 0–100.', { raw: fmtScore(row.raw) })}
        </p>
        <Field label={t('Cộng/trừ điểm (−100 đến 100)')} htmlFor="delta" error={valid ? undefined : t('Giá trị phải từ −100 đến 100')}>
          <Input id="delta" type="number" min={-100} max={100} step={0.5} value={Number.isFinite(delta) ? delta : ''} onChange={(e) => setDelta(e.target.value === '' ? 0 : Number(e.target.value))} className="max-w-[160px]" />
        </Field>
        <Field label={t('Ghi chú')} htmlFor="note" hint={t('Lý do điều chỉnh (ví dụ: trình bày tốt trên lớp). Để 0 và bỏ trống ghi chú để xóa điều chỉnh.')}>
          <Textarea id="note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
