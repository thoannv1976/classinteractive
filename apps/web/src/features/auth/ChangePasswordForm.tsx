import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { LIMITS } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
    newPassword: z.string().min(LIMITS.passwordMin, `Tối thiểu ${LIMITS.passwordMin} ký tự`).max(LIMITS.passwordMax),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Mật khẩu nhập lại không khớp' });

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { changePassword } = useAuth();
  const { register, handleSubmit, formState, reset } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const onSubmit = handleSubmit(async (v) => {
    try {
      await changePassword(v.currentPassword, v.newPassword);
      toast.success('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.');
      reset();
      onDone?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Mật khẩu hiện tại" htmlFor="cur" error={formState.errors.currentPassword?.message}>
        <Input id="cur" type="password" autoComplete="current-password" {...register('currentPassword')} />
      </Field>
      <Field label="Mật khẩu mới" htmlFor="new" error={formState.errors.newPassword?.message}>
        <Input id="new" type="password" autoComplete="new-password" {...register('newPassword')} />
      </Field>
      <Field label="Nhập lại mật khẩu mới" htmlFor="confirm" error={formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
      </Field>
      <Button type="submit" loading={formState.isSubmitting}>
        Đổi mật khẩu
      </Button>
    </form>
  );
}
