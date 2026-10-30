import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { LIMITS, STUDENT_ID_REGEX } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { tk } from '@/i18n';
import { AuthLayout } from './AuthLayout';

const schema = z
  .object({
    studentId: z.string().trim().regex(STUDENT_ID_REGEX, tk('Mã sinh viên không hợp lệ')),
    password: z.string().min(LIMITS.passwordMin, tk('Mật khẩu tối thiểu {{n}} ký tự')).max(LIMITS.passwordMax),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: tk('Mật khẩu nhập lại không khớp') });

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const { t } = useTranslation();
  const err = (m?: string) => (m ? t(m, { n: LIMITS.passwordMin }) : undefined);
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
    <AuthLayout title={t('Đăng ký tài khoản sinh viên')} subtitle={t('Nhập mã sinh viên có trong danh sách lớp và tự đặt mật khẩu.')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert tone="danger">
            {error.msg}
            {error.code === 'ALREADY_REGISTERED' && (
              <>
                {' '}
                <Link to="/login" className="font-medium underline">
                  {t('Đăng nhập')}
                </Link>
              </>
            )}
          </Alert>
        )}
        <Field label={t('Mã sinh viên')} htmlFor="studentId" error={err(formState.errors.studentId?.message)}>
          <Input id="studentId" autoComplete="username" autoCapitalize="characters" aria-invalid={!!formState.errors.studentId} {...register('studentId')} />
        </Field>
        <Field label={t('Mật khẩu')} htmlFor="password" error={err(formState.errors.password?.message)} hint={t('Tối thiểu {{n}} ký tự', { n: LIMITS.passwordMin })}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register('password')} />
        </Field>
        <Field label={t('Nhập lại mật khẩu')} htmlFor="confirm" error={err(formState.errors.confirm?.message)}>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} {...register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          {t('Đăng ký và vào hệ thống')}
        </Button>
        <p className="text-center text-sm text-muted">
          {t('Đã có tài khoản?')}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('Đăng nhập')}
          </Link>
        </p>
        <p className="text-xs leading-relaxed text-muted">
          {t('Hệ thống ghi nhận câu hỏi, câu trả lời và hoạt động của bạn trong các lớp được phân công để giảng viên theo dõi mức độ tham gia học tập. Dữ liệu chỉ được dùng cho mục đích giảng dạy theo quy định của nhà trường.')}
        </p>
      </form>
    </AuthLayout>
  );
}
