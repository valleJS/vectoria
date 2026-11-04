import { Progress as ProgressPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui progress: an inked bar on parchment; `indicatorClassName` colours the fill.
function Progress({
  className,
  value,
  indicatorClassName,
  indicatorColor,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
  /** Fill colour (e.g. a player's heraldry); overrides the gold default. */
  indicatorColor?: string;
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full border border-ink/50 bg-muted',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn('h-full w-full flex-1 bg-gold transition-transform', indicatorClassName)}
        style={{
          transform: `translateX(-${100 - Math.min(100, value ?? 0)}%)`,
          background: indicatorColor,
        }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
