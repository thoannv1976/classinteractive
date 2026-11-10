import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ClassDoc } from '@classinteract/shared';
import { PageHeader } from '@/components/ui/misc';
import { useMe } from '@/lib/auth';
import { useApi } from '@/lib/query';
import { ScoreBreakdown, type ScoreDetail } from '../common/ScoreBreakdown';
import { StudentProfileView } from '../common/StudentProfileView';

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
  const { data } = useApi<ScoreDetail>(`/classes/${classId}/scores/me`, { retry: false });
  if (!data) return null;
  return <ScoreBreakdown data={data} audience="student" />;
}
