import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui input on parchment.
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-sm border border-input bg-background px-2 font-serif text-sm text-foreground shadow-[inset_0_1px_2px_rgba(59,42,24,0.15)] outline-none placeholder:text-muted-foreground focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
