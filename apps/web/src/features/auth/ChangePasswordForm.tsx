import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { LIMITS } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { tk } from '@/i18n';

const schema = z
  .object({
    currentPassword: z.string().min(1, tk('Nhập mật khẩu hiện tại')),
    newPassword: z.string().min(LIMITS.passwordMin, tk('Tối thiểu {{n}} ký tự')).max(LIMITS.passwordMax),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: tk('Mật khẩu nhập lại không khớp') });

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { changePassword } = useAuth();
  const { t } = useTranslation();
  const err = (m?: string) => (m ? t(m, { n: LIMITS.passwordMin }) : undefined);
  const { register, handleSubmit, formState, reset } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const onSubmit = handleSubmit(async (v) => {
    try {
      await changePassword(v.currentPassword, v.newPassword);
      toast.success(t('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.'));
      reset();
      onDone?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label={t('Mật khẩu hiện tại')} htmlFor="cur" error={err(formState.errors.currentPassword?.message)}>
        <Input id="cur" type="password" autoComplete="current-password" {...register('currentPassword')} />
      </Field>
      <Field label={t('Mật khẩu mới')} htmlFor="new" error={err(formState.errors.newPassword?.message)}>
        <Input id="new" type="password" autoComplete="new-password" {...register('newPassword')} />
      </Field>
      <Field label={t('Nhập lại mật khẩu mới')} htmlFor="confirm" error={err(formState.errors.confirm?.message)}>
        <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
      </Field>
      <Button type="submit" loading={formState.isSubmitting}>
        {t('Đổi mật khẩu')}
      </Button>
    </form>
  );
}
