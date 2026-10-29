import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  loginId: z.string().trim().min(1, 'Nhập mã sinh viên hoặc email'),
  password: z.string().min(1, 'Nhập mật khẩu'),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema), defaultValues: { loginId: '', password: '' } });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await login(v.loginId, v.password);
      navigate(params.get('next') || '/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthLayout title="Đăng nhập" subtitle="Sinh viên đăng nhập bằng mã sinh viên. Giảng viên và quản trị dùng email được cấp.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Mã sinh viên hoặc email" htmlFor="loginId" error={formState.errors.loginId?.message}>
          <Input id="loginId" autoComplete="username" autoCapitalize="characters" placeholder="VD: 2251010001" aria-invalid={!!formState.errors.loginId} {...register('loginId')} />
        </Field>
        <Field label="Mật khẩu" htmlFor="password" error={formState.errors.password?.message}>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" className="pr-10" aria-invalid={!!formState.errors.password} {...register('password')} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3 text-muted" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Đăng nhập
        </Button>
        <p className="text-center text-sm text-muted">
          Sinh viên chưa có tài khoản?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Đăng ký bằng mã sinh viên
          </Link>
        </p>
        <p className="text-center text-xs text-muted">Quên mật khẩu? Liên hệ giảng viên hoặc quản trị viên để được đặt lại.</p>
      </form>
    </AuthLayout>
  );
}
