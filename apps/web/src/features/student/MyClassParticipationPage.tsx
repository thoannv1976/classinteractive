import { useParams } from 'react-router';
import type { ClassDoc } from '@classinteract/shared';
import { PageHeader } from '@/components/ui/misc';
import { useMe } from '@/lib/auth';
import { useApi } from '@/lib/query';
import { StudentProfileView } from '../common/StudentProfileView';

export function MyClassParticipationPage() {
  const { classId = '' } = useParams();
  const me = useMe();
  const cls = useApi<{ class: ClassDoc }>(`/classes/${classId}`);
  return (
    <div>
      <PageHeader
        back={{ to: '/participation', label: 'Mức độ tham gia' }}
        title={cls.data ? `${cls.data.class.classCode} · ${cls.data.class.courseName}` : 'Hồ sơ tham gia'}
        description="Chỉ bạn và giảng viên của lớp xem được hồ sơ này. Đây là số liệu tham khảo, không phải điểm chính thức."
      />
      <StudentProfileView classId={classId} uid={me.uid} linkBase={`/classes/${classId}`} />
    </div>
  );
}
