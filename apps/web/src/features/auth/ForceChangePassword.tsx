import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { ChangePasswordForm } from './ChangePasswordForm';

/** Shown when an account uses a temporary password (created or reset by staff). */
export function ForceChangePassword() {
  const { logout } = useAuth();
  const { t } = useTranslation();
  return (
    <AuthLayout title={t('Đặt mật khẩu mới')} subtitle={t('Bạn đang dùng mật khẩu tạm thời. Hãy đặt mật khẩu của riêng bạn để tiếp tục.')}>
      <div className="space-y-4">
        <Alert tone="info">{t('Mật khẩu hiện tại là mật khẩu tạm được giảng viên hoặc quản trị viên cung cấp.')}</Alert>
        <ChangePasswordForm />
        <Button variant="link" onClick={() => void logout()}>
          {t('Đăng xuất')}
        </Button>
      </div>
    </AuthLayout>
  );
}
