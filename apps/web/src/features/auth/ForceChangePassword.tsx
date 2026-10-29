import { useAuth } from '@/lib/auth';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { ChangePasswordForm } from './ChangePasswordForm';

/** Shown when an account uses a temporary password (created or reset by staff). */
export function ForceChangePassword() {
  const { logout } = useAuth();
  return (
    <AuthLayout title="Đặt mật khẩu mới" subtitle="Bạn đang dùng mật khẩu tạm thời. Hãy đặt mật khẩu của riêng bạn để tiếp tục.">
      <div className="space-y-4">
        <Alert tone="info">Mật khẩu hiện tại là mật khẩu tạm được giảng viên hoặc quản trị viên cung cấp.</Alert>
        <ChangePasswordForm />
        <Button variant="link" onClick={() => void logout()}>
          Đăng xuất
        </Button>
      </div>
    </AuthLayout>
  );
}
