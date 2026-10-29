import * as T from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <T.List className={cn('flex gap-1 overflow-x-auto border-b border-border scrollbar-thin', className)}>{children}</T.List>
  );
}

export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <T.Trigger
      value={value}
      className={cn(
        '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-primary data-[state=active]:text-primary',
        className,
      )}
    >
      {children}
    </T.Trigger>
  );
}
