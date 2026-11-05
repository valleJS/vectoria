import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui button in the parchment style: ink rule, serif label, a pressed-in feel on click.
const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-sm border font-serif whitespace-nowrap transition-[color,background-color,box-shadow,transform] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-ink/55 bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_1px_0_rgba(59,42,24,0.25)] hover:bg-parchment-deep',
        primary:
          'border-ink bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_0_rgba(59,42,24,0.35)] hover:bg-seal-light',
        destructive:
          'border-ink bg-destructive text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-seal',
        selected: 'border-ink bg-ink text-parchment',
        outline: 'border-ink/45 bg-transparent text-ink hover:bg-accent',
        ghost: 'border-transparent bg-transparent text-ink hover:bg-accent',
        link: 'h-auto border-transparent bg-transparent p-0 text-ink-soft underline underline-offset-2 hover:text-seal',
        /** No chrome: illustrated buttons (book, chest, cards) keep focus ring and states. */
        plain: 'h-auto rounded-none border-transparent bg-transparent p-0 active:translate-y-0',
      },
      size: {
        default: 'h-8 px-2.5 text-sm',
        sm: 'h-7 px-2 text-xs',
        lg: 'h-10 px-4 text-base',
        icon: 'size-8',
        compact: 'h-7 px-2.5 text-sm',
        'icon-sm': 'size-6 text-sm',
      },
    },
    compoundVariants: [
      // Lucide icons default to 16 px, except in `plain` buttons whose art sizes itself.
      {
        variant: ['default', 'primary', 'destructive', 'selected', 'outline', 'ghost', 'link'],
        className: "[&_svg:not([class*='size-'])]:size-4",
      },
      // Chrome-less variants take their content's size, whatever `size` says.
      { variant: ['plain', 'link'], className: 'h-auto p-0' },
    ],
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
