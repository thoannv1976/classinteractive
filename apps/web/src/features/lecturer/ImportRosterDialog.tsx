import { FileSpreadsheet, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { invalidate } from '@/lib/query';

interface Row {
  studentId: string;
  fullName: string;
  email: string;
}
interface Result {
  result: { total: number; created: number; updated: number; enrolled: number; pendingRegistration: number; alreadyMember: number } | null;
  errors: { row: number; message: string }[];
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** Paste lines like "2251010001, Nguyễn Văn A" or "2251010001<TAB>Nguyễn Văn A<TAB>email". */
function parsePasted(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/\t|;|,/).map((p) => p.trim());
      return { studentId: parts[0] ?? '', fullName: parts[1] ?? '', email: parts[2] ?? '' };
    })
    .filter((r) => !/^(m[aã]|mssv|student)/i.test(r.studentId));
}

export function ImportRosterDialog({ open, onOpenChange, classId }: { open: boolean; onOpenChange: (v: boolean) => void; classId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [pasted, setPasted] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [columns, setColumns] = useState<Record<string, string> | null>(null);

  const reset = () => {
    setRows([]);
    setPasted('');
    setResult(null);
    setColumns(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error(t('File quá lớn (tối đa 2 MB)'));
    setParsing(true);
    try {
      const r = await api.post<{ rows: Row[]; columns: Record<string, string> }>('/roster/parse', { filename: file.name, contentBase64: await toBase64(file) });
      setRows(r.rows);
      setColumns(r.columns);
      if (!r.rows.length) toast.error(t('Không tìm thấy sinh viên nào trong file'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const r = await api.post<Result>(`/classes/${classId}/roster/import`, { rows: rows.map((x) => ({ ...x, email: x.email || undefined })) });
      setResult(r);
      await invalidate(`/classes/${classId}`);
      toast.success(t('Đã nhập danh sách'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      size="xl"
      title={t('Nhập danh sách sinh viên')}
      description={t('Chỉ sinh viên có trong danh sách mới đăng ký được tài khoản. Sinh viên đã có tài khoản được thêm vào lớp ngay.')}
      footer={
        result ? (
          <Button onClick={() => { reset(); onOpenChange(false); }}>{t('Xong')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Hủy')}</Button>
            <Button onClick={doImport} loading={importing} disabled={!rows.length}>
              {t('Nhập {{count}} sinh viên', { count: rows.length })}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          {result.result && (
            <Alert tone="success" title={t('Kết quả nhập')}>
              <ul className="mt-1 list-disc pl-5">
                <li>{t('{{count}} mã sinh viên hợp lệ', { count: result.result.total })}</li>
                <li>{t('{{count}} sinh viên đã có tài khoản được thêm vào lớp', { count: result.result.enrolled })}</li>
                <li>{t('{{count}} sinh viên chưa đăng ký – có thể tự đăng ký bằng mã sinh viên', { count: result.result.pendingRegistration })}</li>
                {result.result.alreadyMember > 0 && <li>{t('{{count}} sinh viên đã có trong lớp', { count: result.result.alreadyMember })}</li>}
              </ul>
            </Alert>
          )}
          {result.errors.length > 0 && (
            <Alert tone="warning" title={t('{{count}} dòng bị bỏ qua', { count: result.errors.length })}>
              <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                {result.errors.map((e) => (
                  <li key={e.row}>{t('Dòng {{row}}: {{message}}', { row: e.row, message: e.message })}</li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Tabs defaultValue="file">
            <TabsList>
              <TabsTrigger value="file"><FileSpreadsheet className="h-4 w-4" /> {t('Từ file Excel/CSV')}</TabsTrigger>
              <TabsTrigger value="paste">{t('Dán danh sách')}</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="pt-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-strong bg-surface-2 px-6 py-8 text-center hover:border-primary">
                <Upload className="h-8 w-8 text-muted" />
                <span className="mt-2 text-sm font-medium">{parsing ? t('Đang đọc file…') : t('Chọn file .xlsx hoặc .csv')}</span>
                <span className="mt-1 text-xs text-muted">{t('Cần có cột "Mã SV" và "Họ tên" (hoặc "Họ" + "Tên"); cột "Email" không bắt buộc.')}</span>
                <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {columns && (
                <p className="mt-2 text-xs text-muted">
                  {t('Đã nhận cột: {{columns}}', { columns: Object.entries(columns).map(([k, v]) => `${v} → ${k}`).join(', ') })}
                </p>
              )}
            </TabsContent>
            <TabsContent value="paste" className="space-y-2 pt-4">
              <Textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={t('Mỗi dòng: Mã SV, Họ tên, Email (không bắt buộc)\n2251010001, Nguyễn Văn An\n2251010002, Trần Thị Bình, binh@st.edu.vn')}
                className="min-h-[160px] font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={() => setRows(parsePasted(pasted))} disabled={!pasted.trim()}>
                {t('Xem trước')}
              </Button>
            </TabsContent>
          </Tabs>
          {rows.length > 0 && (
            <div className="rounded-lg border border-border">
              <p className="border-b border-border px-3 py-2 text-sm font-medium">{t('Xem trước: {{count}} dòng', { count: rows.length })}</p>
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <thead>
                    <tr><Th>#</Th><Th>{t('Mã SV')}</Th><Th>{t('Họ tên')}</Th><Th>Email</Th></tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 500).map((r, i) => (
                      <tr key={i}>
                        <Td className="text-muted">{i + 1}</Td>
                        <Td className="font-mono text-xs">{r.studentId || <span className="text-danger">{t('thiếu')}</span>}</Td>
                        <Td>{r.fullName || <span className="text-danger">{t('thiếu')}</span>}</Td>
                        <Td className="text-muted">{r.email}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
