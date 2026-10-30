import { BarChart3, ExternalLink, FileJson, FileSpreadsheet, FileText, Lightbulb, MessageCircleQuestion, NotebookText, Presentation, Tags, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { MemberDoc, SessionDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { tk } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/query';
import { sessionLabel } from '../common/SessionStatus';
import { useClassCtx } from './ClassLayout';

const DATASETS = [
  ['students', tk('Student Participation – tham gia của sinh viên')],
  ['scores', tk('Engagement Scores – điểm tham gia')],
  ['sessions', tk('Session Statistics – thống kê buổi học')],
  ['questions', tk('Questions – câu hỏi, nhận xét, thảo luận')],
  ['answers', tk('Answers – câu trả lời và bình luận')],
  ['topics', tk('Topics – tổng hợp theo chủ đề')],
  ['clusters', tk('Question Clusters – nhóm câu hỏi')],
  ['activities', tk('Activities – kết quả hoạt động')],
  ['submissions', tk('Activity Submissions – bài nộp của sinh viên')],
] as const;

type PrintType = 'session' | 'class' | 'student' | 'topics' | 'unanswered' | 'interactions' | 'insights';

const PRINT_REPORTS: { type: PrintType; title: string; description: string; icon: ReactNode }[] = [
  { type: 'session', title: tk('Báo cáo buổi học'), description: tk('Thông tin, số liệu, điểm danh, kết quả hoạt động, câu hỏi – trả lời và bản tóm tắt của một buổi.'), icon: <NotebookText className="h-4 w-4" /> },
  { type: 'class', title: tk('Báo cáo tổng hợp lớp học'), description: tk('Số liệu chính của học kỳ, bảng thống kê từng buổi, biểu đồ và chủ đề nổi bật.'), icon: <Presentation className="h-4 w-4" /> },
  { type: 'student', title: tk('Báo cáo tham gia của sinh viên'), description: tk('Hồ sơ tham gia của một sinh viên: số liệu, xu hướng theo buổi và lịch sử đóng góp.'), icon: <UserRound className="h-4 w-4" /> },
  { type: 'topics', title: tk('Báo cáo câu hỏi theo chủ đề'), description: tk('Các luồng câu hỏi – trả lời được nhóm theo chủ đề (tối đa 20 chủ đề).'), icon: <Tags className="h-4 w-4" /> },
  { type: 'unanswered', title: tk('Danh sách câu hỏi chưa được giải đáp'), description: tk('Bảng câu hỏi còn mở kèm buổi học, lượt bình chọn và thời gian đăng.'), icon: <MessageCircleQuestion className="h-4 w-4" /> },
  { type: 'interactions', title: tk('So sánh tương tác giữa các buổi học'), description: tk('Bảng so sánh, biểu đồ cột/đường và phân bố mức độ tham gia.'), icon: <BarChart3 className="h-4 w-4" /> },
  { type: 'insights', title: tk('Gợi ý giảng dạy'), description: tk('Nhận định của AI kèm căn cứ và câu hỏi tiếp nối (cần chạy phân tích trước).'), icon: <Lightbulb className="h-4 w-4" /> },
];

function PrintReportsCard({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const sessions = useApi<{ items: SessionDoc[] }>(`/classes/${classId}/sessions`);
  const members = useApi<{ members: MemberDoc[] }>(`/classes/${classId}/members`);
  const held = (sessions.data?.items ?? []).filter((s) => s.status !== 'draft' && s.status !== 'archived');
  const students = (members.data?.members ?? []).filter((m) => m.role === 'student');
  const [sessionId, setSessionId] = useState('');
  const [uid, setUid] = useState('');
  const selectedSession = sessionId || held[held.length - 1]?.sessionId || '';

  const open = (type: PrintType) => {
    const qs = type === 'session' ? `?sessionId=${encodeURIComponent(selectedSession)}` : type === 'student' ? `?uid=${encodeURIComponent(uid)}` : '';
    window.open(`/print/${classId}/${type}${qs}`, '_blank');
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader title={t('Báo cáo trình bày (in / PDF)')} description={t('Mở bản in khổ A4 trong thẻ mới, sau đó chọn “In / Lưu PDF” (chọn máy in “Lưu thành PDF”).')} />
      <CardBody className="p-0 sm:p-0">
        <ul className="divide-y divide-border">
          {PRINT_REPORTS.map((r) => {
            const missing = (r.type === 'session' && !selectedSession) || (r.type === 'student' && !uid);
            return (
              <li key={r.type} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 rounded-lg bg-primary-soft p-1.5 text-primary">{r.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t(r.title)}</p>
                    <p className="text-xs text-muted">{t(r.description)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {r.type === 'session' && (
                    <Select aria-label={t('Chọn buổi học')} value={selectedSession} onChange={(e) => setSessionId(e.target.value)} className="h-8 w-full text-xs sm:w-56" disabled={!held.length}>
                      {!held.length && <option value="">{t('Chưa có buổi học nào diễn ra')}</option>}
                      {[...held].reverse().map((s) => (
                        <option key={s.sessionId} value={s.sessionId}>
                          {sessionLabel(s)}
                        </option>
                      ))}
                    </Select>
                  )}
                  {r.type === 'student' && (
                    <Select aria-label={t('Chọn sinh viên')} value={uid} onChange={(e) => setUid(e.target.value)} className="h-8 w-full text-xs sm:w-56" disabled={!students.length}>
                      <option value="">{students.length ? t('— Chọn sinh viên —') : t('Lớp chưa có sinh viên')}</option>
                      {students.map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.studentId ? `${m.studentId} – ${m.displayName}` : m.displayName}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Button size="sm" variant="outline" onClick={() => open(r.type)} disabled={missing}>
                    <ExternalLink className="h-4 w-4" /> {t('Mở bản in')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

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
      <PrintReportsCard classId={cls.classId} />
      <Card>
        <CardHeader
          title={t('Excel tổng hợp (XLSX)')}
          description={t('Một file gồm đầy đủ các bảng: tham gia sinh viên, điểm tham gia, thống kê buổi, câu hỏi, câu trả lời, chủ đề, nhóm câu hỏi, hoạt động.')}
        />
        <CardBody className="space-y-3">
          <Button onClick={() => dl('xlsx', `${base}?format=xlsx`, `${cls.classCode}.xlsx`)} loading={busy === 'xlsx'}>
            <FileSpreadsheet className="h-4 w-4" /> {t('Tải file Excel')}
          </Button>
          <p className="text-xs text-muted">{t('Câu hỏi ẩn danh được xuất là “Ẩn danh” {{note}}.', { note: cls.settings.revealAnonymousToStaff ? t('(lớp cho phép giảng viên xem danh tính nên hiển thị tên kèm ghi chú)') : t('theo chính sách lớp') })}</p>
        </CardBody>
      </Card>
      <Card>
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
