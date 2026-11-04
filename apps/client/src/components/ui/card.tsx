import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui card as a parchment sheet: ink border, inner hairline rule, offset ink shadow.

function Card({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col rounded-sm border border-ink bg-card p-[3px] text-sm text-card-foreground shadow-[2px_3px_0_rgba(59,42,24,0.3)]',
        className,
      )}
      {...props}
    >
      {/* Inner rule; flex-1 + min-h-0 pass a height limit on to scrolling children. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-[1px] border border-ink/30">
        {children}
      </div>
    </div>
  );
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex items-center gap-2 px-3 pt-2 pb-1', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('flex min-w-0 items-center gap-2 text-base leading-tight italic', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-3 py-2', className)} {...props} />;
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-ink/20 px-3 py-2', className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
