import { FileJson, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { tk } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useClassCtx } from './ClassLayout';

const DATASETS = [
  ['students', tk('Student Participation – tham gia của sinh viên')],
  ['sessions', tk('Session Statistics – thống kê buổi học')],
  ['questions', tk('Questions – câu hỏi, nhận xét, thảo luận')],
  ['answers', tk('Answers – câu trả lời và bình luận')],
  ['topics', tk('Topics – tổng hợp theo chủ đề')],
  ['activities', tk('Activities – kết quả hoạt động')],
  ['submissions', tk('Activity Submissions – bài nộp của sinh viên')],
] as const;

export function ReportsPage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const [busy, setBusy] = useState<string | null>(null);
  const dl = async (key: string, path: string, name: string) => {
    setBusy(key);
    try {
      await api.download(path, name);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const base = `/classes/${cls.classId}/export`;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title={t('Excel tổng hợp (XLSX)')} description={t('Một file gồm đầy đủ các bảng: tham gia sinh viên, thống kê buổi, câu hỏi, câu trả lời, chủ đề, hoạt động.')} />
        <CardBody className="space-y-3">
          <Button onClick={() => dl('xlsx', `${base}?format=xlsx`, `${cls.classCode}.xlsx`)} loading={busy === 'xlsx'}>
            <FileSpreadsheet className="h-4 w-4" /> {t('Tải file Excel')}
          </Button>
          <p className="text-xs text-muted">{t('Câu hỏi ẩn danh được xuất là “Ẩn danh” {{note}}.', { note: cls.settings.revealAnonymousToStaff ? t('(lớp cho phép giảng viên xem danh tính nên hiển thị tên kèm ghi chú)') : t('theo chính sách lớp') })}</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Báo cáo trình bày (PDF)')} description={t('Mở bản in của trang tổng quan lớp và chọn “Lưu thành PDF”.')} />
        <CardBody>
          <Button variant="outline" onClick={() => window.open(`/teach/classes/${cls.classId}?print=1`, '_blank')}>
            <Printer className="h-4 w-4" /> {t('In / Lưu PDF')}
          </Button>
        </CardBody>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title={t('Từng bảng dữ liệu (CSV UTF-8) và JSON tích hợp')} />
        <CardBody className="space-y-2">
          {DATASETS.map(([k, label]) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <span className="text-sm">{t(label)}</span>
              <Button size="sm" variant="outline" onClick={() => dl(k, `${base}?format=csv&dataset=${k}`, `${cls.classCode}_${k}.csv`)} loading={busy === k}>
                <FileText className="h-4 w-4" /> CSV
              </Button>
            </div>
          ))}
          <div className="pt-2">
            <Button size="sm" variant="ghost" onClick={() => dl('json', `${base}?format=json`, `${cls.classCode}.json`)} loading={busy === 'json'}>
              <FileJson className="h-4 w-4" /> {t('Tải toàn bộ dạng JSON')}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
