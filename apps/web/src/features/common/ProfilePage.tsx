import { useTranslation } from 'react-i18next';
import { ROLE_LABELS } from '@classinteract/shared';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Avatar, PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useAuth, useMe } from '@/lib/auth';
import { ChangePasswordForm } from '../auth/ChangePasswordForm';

export function ProfilePage() {
  const me = useMe();
  const { logout } = useAuth();
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('Hồ sơ')} />
      <Card>
        <CardBody className="flex items-center gap-4">
          <Avatar name={me.displayName} className="h-14 w-14 text-base" />
          <div className="min-w-0">
            <p className="text-lg font-semibold">{me.displayName}</p>
            <p className="text-sm text-muted">{t(ROLE_LABELS[me.role])}</p>
            <p className="text-sm text-muted">{me.studentId ? t('Mã sinh viên: {{id}}', { id: me.studentId }) : me.email}</p>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Đổi mật khẩu')} description={t('Sau khi đổi, các thiết bị khác sẽ bị đăng xuất.')} />
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
      <Card>
        {/* Intentionally bilingual so the switcher is easy to find in either language. */}
        <CardHeader title="Ngôn ngữ / Language" description={t('Chọn ngôn ngữ hiển thị của ứng dụng.')} />
        <CardBody>
          <LanguageSwitcher />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Quyền riêng tư')} />
        <CardBody className="space-y-2 text-sm text-muted">
          <p>{t('ClassInteract AI ghi nhận câu hỏi, câu trả lời, phản hồi và hoạt động của bạn trong các lớp được phân công, gắn với lớp, buổi học và chủ đề.')}</p>
          <p>{t('Dữ liệu chỉ dùng cho mục đích giảng dạy: giảng viên theo dõi mức độ tham gia và các vấn đề cần giải thích thêm. Số liệu tham gia là tham khảo, không tự động trở thành điểm chính thức.')}</p>
          <p>{t('Khi giảng viên dùng AI hỗ trợ, hệ thống chỉ gửi nội dung câu hỏi và thông tin buổi học, không gửi tên hay mã sinh viên.')}</p>
        </CardBody>
      </Card>
      <Button variant="danger-outline" onClick={() => void logout()}>{t('Đăng xuất')}</Button>
    </div>
  );
}
