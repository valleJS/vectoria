import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui badge: small counters and labels (unread, NEU, troop counts).
const badgeVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1 rounded-full border px-1.5 font-serif text-[11px] leading-4 whitespace-nowrap tabular-nums',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-ink/30 bg-secondary text-secondary-foreground',
        outline: 'border-seal/70 text-seal',
        gold: 'border-ink/40 bg-gold text-ink',
        /** Caption plate under an illustrated button (Handbuch, Neuerungen). */
        plate:
          'rounded-sm border-ink bg-card px-1.5 text-xs leading-5 text-ink italic shadow-[1px_2px_0_rgba(59,42,24,0.35)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
