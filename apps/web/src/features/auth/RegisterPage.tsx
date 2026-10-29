import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { LIMITS, STUDENT_ID_REGEX } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthLayout } from './AuthLayout';

const schema = z
  .object({
    studentId: z.string().trim().regex(STUDENT_ID_REGEX, 'Mã sinh viên không hợp lệ'),
    password: z.string().min(LIMITS.passwordMin, `Mật khẩu tối thiểu ${LIMITS.passwordMin} ký tự`).max(LIMITS.passwordMax),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Mật khẩu nhập lại không khớp' });

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<{ msg: string; code?: string } | null>(null);
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { studentId: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await registerAccount(v.studentId, v.password);
      navigate('/home', { replace: true });
    } catch (e) {
      setError({ msg: errorMessage(e), code: e instanceof ApiError ? e.code : undefined });
    }
  });

  return (
    <AuthLayout title="Đăng ký tài khoản sinh viên" subtitle="Nhập mã sinh viên có trong danh sách lớp và tự đặt mật khẩu.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert tone="danger">
            {error.msg}
            {error.code === 'ALREADY_REGISTERED' && (
              <>
                {' '}
                <Link to="/login" className="font-medium underline">
                  Đăng nhập
                </Link>
              </>
            )}
          </Alert>
        )}
        <Field label="Mã sinh viên" htmlFor="studentId" error={formState.errors.studentId?.message}>
          <Input id="studentId" autoComplete="username" autoCapitalize="characters" aria-invalid={!!formState.errors.studentId} {...register('studentId')} />
        </Field>
        <Field label="Mật khẩu" htmlFor="password" error={formState.errors.password?.message} hint={`Tối thiểu ${LIMITS.passwordMin} ký tự`}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register('password')} />
        </Field>
        <Field label="Nhập lại mật khẩu" htmlFor="confirm" error={formState.errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} {...register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Đăng ký và vào hệ thống
        </Button>
        <p className="text-center text-sm text-muted">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Đăng nhập
          </Link>
        </p>
        <p className="text-xs leading-relaxed text-muted">
          Hệ thống ghi nhận câu hỏi, câu trả lời và hoạt động của bạn trong các lớp được phân công để giảng viên theo dõi mức độ tham gia học tập. Dữ liệu chỉ được dùng cho mục đích giảng dạy theo quy định của nhà trường.
        </p>
      </form>
    </AuthLayout>
  );
}
