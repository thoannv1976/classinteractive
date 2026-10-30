import { Info } from 'lucide-react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ClassDoc, ScoreComponent, ScoreConfig } from '@classinteract/shared';
import { SCORE_COMPONENTS, SCORE_COMPONENT_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { useMe } from '@/lib/auth';
import { useApi } from '@/lib/query';
import { cn } from '@/lib/utils';
import { StudentProfileView } from '../common/StudentProfileView';

interface MyScore {
  config: ScoreConfig;
  sessionsHeld: number;
  row: {
    components: Record<ScoreComponent, { value: number | null; done: number; possible: number }>;
    raw: number | null;
    adjustment: number;
    score: number | null;
    sessionsCounted: number;
  };
}

export function MyClassParticipationPage() {
  const { classId = '' } = useParams();
  const me = useMe();
  const { t } = useTranslation();
  const cls = useApi<{ class: ClassDoc }>(`/classes/${classId}`);
  return (
    <div>
      <PageHeader
        back={{ to: '/participation', label: t('Mức độ tham gia') }}
        title={cls.data ? `${cls.data.class.classCode} · ${cls.data.class.courseName}` : t('Hồ sơ tham gia')}
        description={t('Chỉ bạn và giảng viên của lớp xem được hồ sơ này. Đây là số liệu tham khảo, không phải điểm chính thức.')}
      />
      <MyScoreCard classId={classId} />
      <StudentProfileView classId={classId} uid={me.uid} linkBase={`/classes/${classId}`} />
    </div>
  );
}

/** The student's own reference engagement score – shown only when the class allows it (403 otherwise → nothing). */
function MyScoreCard({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const { data } = useApi<MyScore>(`/classes/${classId}/scores/me`, { retry: false });
  if (!data) return null;
  const { row, config } = data;
  return (
    <Card className="mb-6">
      <CardHeader
        title={t('Điểm tham khảo')}
        description={t('Điểm tham gia (0–100) tính trên {{n}} buổi học đã diễn ra', { n: row.sessionsCounted })}
        actions={<Badge tone="neutral">{t('Phiên bản công thức {{v}}', { v: config.version })}</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <p className="text-4xl font-semibold tabular-nums">{row.score === null ? '—' : row.score.toFixed(1)}</p>
          <p className="pb-1 text-sm text-muted">
            {row.score === null
              ? t('Chưa có cơ hội tham gia nào được tính')
              : row.adjustment
                ? t('Theo công thức {{raw}}, điều chỉnh của giảng viên {{adj}}', { raw: row.raw?.toFixed(1) ?? '—', adj: `${row.adjustment > 0 ? '+' : ''}${row.adjustment}` })
                : t('trên 100')}
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SCORE_COMPONENTS.map((k) => {
            const c = row.components[k];
            return (
              <li key={k} className={cn('rounded-lg border border-border p-3', c.value === null && 'opacity-60')}>
                <p className="text-xs text-muted">{t(SCORE_COMPONENT_LABELS[k])}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{c.value === null ? '—' : `${Math.round(c.value * 100)}%`}</p>
                <p className="text-xs text-muted">
                  {c.possible > 0 ? t('{{done}}/{{possible}} · trọng số {{w}}%', { done: c.done, possible: c.possible, w: config.weights[k] }) : t('Chưa có cơ hội – không tính')}
                </p>
                {c.value !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(c.value * 100)}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-primary-soft/60 px-3 py-2 text-xs text-blue-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            {t('Đây là điểm tham khảo, không phải điểm chính thức. Điểm chỉ tính trên các cơ hội thực sự đã có (buổi học đã diễn ra, hoạt động đã mở); mỗi buổi chỉ tính một số đóng góp tối đa. Điểm chỉ được dùng chính thức sau khi giảng viên xác nhận.')}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
