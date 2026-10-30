import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import type { ProfileData } from '../common/StudentProfileView';
import { StudentProfileView } from '../common/StudentProfileView';
import { useClassCtx } from './ClassLayout';

export function StudentDetailPage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const { uid = '' } = useParams();
  const { data } = useApi<ProfileData>(`/classes/${cls.classId}/analytics/students/${uid}`);
  return (
    <div>
      <PageHeader
        back={{ to: `/teach/classes/${cls.classId}/analytics`, label: t('Mức độ tham gia') }}
        title={data ? `${data.member.displayName}` : t('Hồ sơ sinh viên')}
        description={data ? t('Mã SV {{studentId}} · {{role}}', { studentId: data.member.studentId ?? '', role: data.member.role === 'ta' ? t('Trợ giảng') : t('Sinh viên', { context: 'n' }) }) : undefined}
      />
      <StudentProfileView classId={cls.classId} uid={uid} linkBase={`/teach/classes/${cls.classId}`} />
    </div>
  );
}
