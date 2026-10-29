import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

export function PageHeader({ title, description, actions, back, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; className?: string }) {
  return (
    <div className={cn('mb-5', className)}>
      {back && (
        <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'primary' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'primary' | 'secondary' | 'accent' | 'neutral' | 'danger' }) {
  const toneCls = {
    primary: 'bg-primary-soft text-primary',
    secondary: 'bg-secondary-soft text-secondary',
    accent: 'bg-accent-soft text-accent',
    neutral: 'bg-slate-100 text-slate-600',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className={cn('rounded-lg p-1.5', toneCls)}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Avatar({ name, className, ai }: { name: string; className?: string; ai?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        ai ? 'bg-violet-100 text-violet-700' : 'bg-primary-soft text-primary',
        className,
      )}
      aria-hidden
    >
      {ai ? 'AI' : initials(name) || '?'}
    </span>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-max text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className, onClick }: { children?: ReactNode; className?: string; onClick?: () => void }) => (
  <th
    className={cn('whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted', onClick && 'cursor-pointer select-none hover:text-fg', className)}
    onClick={onClick}
  >
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cn('border-b border-border px-3 py-2.5 align-middle', className)}>{children}</td>
);
