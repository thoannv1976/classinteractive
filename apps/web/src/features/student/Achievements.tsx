import { Award, CalendarCheck, Flame, Footprints, HandHelping, ListChecks, Lock, MessageCircleQuestion, NotebookPen, Target, Trophy } from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { BadgeId, BadgeResult } from '@classinteract/shared';
import { BADGE_SESSIONS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { tk } from '@/i18n';
import { useApi } from '@/lib/query';
import { cn } from '@/lib/utils';

interface Milestone {
  count: number;
  target: number;
  reached: number;
}

export interface AchievementsData {
  badges: BadgeResult[];
  streak: { current: number; best: number };
  sessionsHeld: number;
  classGoals: { questions: Milestone; answers: Milestone };
}

const BADGES: Record<BadgeId, { icon: ComponentType<{ className?: string }>; title: string; desc: string }> = {
  first_step: { icon: Footprints, title: tk('Bước đầu tiên'), desc: tk('Vào buổi học đầu tiên') },
  curious: { icon: MessageCircleQuestion, title: tk('Người hay hỏi'), desc: tk('Đặt đủ số câu hỏi được tính trong {{n}} buổi') },
  helper: { icon: HandHelping, title: tk('Người giải đáp'), desc: tk('Trả lời, thảo luận đủ mức được tính trong {{n}} buổi') },
  recognized: { icon: Award, title: tk('Được giảng viên công nhận'), desc: tk('Có câu trả lời được giảng viên xác nhận') },
  all_activities: { icon: ListChecks, title: tk('Không bỏ hoạt động nào'), desc: tk('Làm đủ mọi hoạt động đã mở (từ 3 hoạt động trở lên)') },
  reflective: { icon: NotebookPen, title: tk('Tổng kết đều đặn'), desc: tk('Nộp đủ mọi phiếu cuối buổi (từ 2 phiếu trở lên)') },
  regular: { icon: CalendarCheck, title: tk('Chuyên cần'), desc: tk('Có mặt ở mọi buổi đã diễn ra (từ 3 buổi trở lên)') },
};

/** The student's badges and attendance streak, on "My participation". */
export function AchievementsCard({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const { data } = useApi<AchievementsData>(`/classes/${classId}/achievements/me`, { retry: false });
  if (!data || !data.badges.length) return null;
  const earned = data.badges.filter((b) => b.earned).length;
  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" /> {t('Huy hiệu của bạn')}
          </span>
        }
        description={t('Mỗi huy hiệu ứng với một việc được tính vào điểm tham gia. Huy hiệu chỉ hiện với bạn, không có bảng xếp hạng.')}
        actions={<Badge tone={earned ? 'success' : 'neutral'}>{t('{{n}}/{{total}} huy hiệu', { n: earned, total: data.badges.length })}</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <Flame className={cn('h-5 w-5', data.streak.current ? 'text-orange-500' : 'text-orange-300')} />
          {data.streak.current
            ? t('Chuỗi có mặt hiện tại: {{n}} buổi liên tiếp', { n: data.streak.current })
            : t('Chưa có chuỗi có mặt. Vào buổi tới để bắt đầu chuỗi!')}
          {data.streak.best > data.streak.current && <span className="text-orange-800/70">· {t('dài nhất {{n}} buổi', { n: data.streak.best })}</span>}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.badges.map((b) => {
            const meta = BADGES[b.id];
            const Icon = meta.icon;
            return (
              <li key={b.id} className={cn('rounded-lg border p-3', b.earned ? 'border-amber-300 bg-amber-50' : 'border-border opacity-80')}>
                <div className="flex items-start gap-2">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', b.earned ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-400')}>
                    {b.earned ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{t(meta.title)}</p>
                    <p className="text-xs text-muted">{t(meta.desc, { n: BADGE_SESSIONS })}</p>
                  </div>
                </div>
                {!b.earned && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.round((b.current / Math.max(1, b.target)) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-right text-xs tabular-nums text-muted">
                      {b.current}/{b.target}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

/** Goals the whole class works towards together – progress, not a ranking. */
export function ClassGoalsCard({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const { data } = useApi<AchievementsData>(`/classes/${classId}/achievements/me`, { retry: false });
  if (!data) return null;
  const goals: Array<{ label: string; m: Milestone }> = [
    { label: t('Câu hỏi của cả lớp'), m: data.classGoals.questions },
    { label: t('Trả lời và thảo luận của cả lớp'), m: data.classGoals.answers },
  ];
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> {t('Mục tiêu của cả lớp')}
          </span>
        }
        description={t('Cả lớp cùng góp để chạm mốc tiếp theo.')}
        actions={
          data.streak.current > 1 ? (
            <Link to={`/participation/${classId}`} className="flex items-center gap-1 text-xs font-medium text-orange-600">
              <Flame className="h-4 w-4" /> {t('Chuỗi của bạn: {{n}} buổi', { n: data.streak.current })}
            </Link>
          ) : undefined
        }
      />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        {goals.map(({ label, m }) => {
          const pct = Math.round(((m.count - m.reached) / Math.max(1, m.target - m.reached)) * 100);
          return (
            <div key={label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-muted">
                  {m.count}/{m.target}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{t('Còn {{n}} nữa để chạm mốc {{target}}', { n: m.target - m.count, target: m.target })}</p>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
