import { ROLE_LABELS } from '@classinteract/shared';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Avatar, PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useAuth, useMe } from '@/lib/auth';
import { ChangePasswordForm } from '../auth/ChangePasswordForm';

export function ProfilePage() {
  const me = useMe();
  const { logout } = useAuth();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Hồ sơ" />
      <Card>
        <CardBody className="flex items-center gap-4">
          <Avatar name={me.displayName} className="h-14 w-14 text-base" />
          <div className="min-w-0">
            <p className="text-lg font-semibold">{me.displayName}</p>
            <p className="text-sm text-muted">{ROLE_LABELS[me.role]}</p>
            <p className="text-sm text-muted">{me.studentId ? `Mã sinh viên: ${me.studentId}` : me.email}</p>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Đổi mật khẩu" description="Sau khi đổi, các thiết bị khác sẽ bị đăng xuất." />
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Quyền riêng tư" />
        <CardBody className="space-y-2 text-sm text-muted">
          <p>ClassInteract AI ghi nhận câu hỏi, câu trả lời, phản hồi và hoạt động của bạn trong các lớp được phân công, gắn với lớp, buổi học và chủ đề.</p>
          <p>Dữ liệu chỉ dùng cho mục đích giảng dạy: giảng viên theo dõi mức độ tham gia và các vấn đề cần giải thích thêm. Số liệu tham gia là tham khảo, không tự động trở thành điểm chính thức.</p>
          <p>Khi giảng viên dùng AI hỗ trợ, hệ thống chỉ gửi nội dung câu hỏi và thông tin buổi học, không gửi tên hay mã sinh viên.</p>
        </CardBody>
      </Card>
      <Button variant="danger-outline" onClick={() => void logout()}>Đăng xuất</Button>
    </div>
  );
}
