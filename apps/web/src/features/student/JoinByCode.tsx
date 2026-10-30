import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api, errorMessage } from '@/lib/api';
import { RequestJoinDialog } from './RequestJoinDialog';

export function JoinByCode({ initialCode = '' }: { initialCode?: string }) {
  const { t } = useTranslation();
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [notMember, setNotMember] = useState<{ classId: string; classCode: string; className: string } | null>(null);
  const navigate = useNavigate();

  const join = async (c = code) => {
    if (!c.trim()) return;
    setLoading(true);
    try {
      const r = await api.post<{ classId: string; sessionId: string }>('/sessions/join-by-code', { code: c.trim() });
      navigate(`/classes/${r.classId}/sessions/${r.sessionId}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_MEMBER') setNotMember(e.details as never);
      else toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('Nhập mã tham gia (VD: K7M2QX)')}
            className="pl-9 font-mono uppercase tracking-widest"
            maxLength={10}
            aria-label={t('Mã tham gia buổi học')}
            autoCapitalize="characters"
          />
        </div>
        <Button type="submit" loading={loading} disabled={!code.trim()}>
          {t('Tham gia')}
        </Button>
      </form>
      <RequestJoinDialog
        open={!!notMember}
        onOpenChange={(v) => !v && setNotMember(null)}
        classId={notMember?.classId}
        description={notMember ? t('Bạn chưa có trong danh sách lớp {{code}} – {{name}}. Gửi yêu cầu để giảng viên duyệt?', { code: notMember.classCode, name: notMember.className }) : undefined}
      />
    </>
  );
}
