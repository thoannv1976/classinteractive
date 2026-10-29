import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import type { ProfileData } from '../common/StudentProfileView';
import { StudentProfileView } from '../common/StudentProfileView';
import { useClassCtx } from './ClassLayout';

export function StudentDetailPage() {
  const { cls } = useClassCtx();
  const { uid = '' } = useParams();
  const { data } = useApi<ProfileData>(`/classes/${cls.classId}/analytics/students/${uid}`);
  return (
    <div>
      <PageHeader
        back={{ to: `/teach/classes/${cls.classId}/analytics`, label: 'Mức độ tham gia' }}
        title={data ? `${data.member.displayName}` : 'Hồ sơ sinh viên'}
        description={data ? `Mã SV ${data.member.studentId ?? ''} · ${data.member.role === 'ta' ? 'Trợ giảng' : 'Sinh viên'}` : undefined}
      />
      <StudentProfileView classId={cls.classId} uid={uid} linkBase={`/teach/classes/${cls.classId}`} />
    </div>
  );
}
