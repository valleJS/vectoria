import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui toggle group. Used for the phone's bottom tab bar: one sheet at a time, and tapping
// the open one again closes it (which radix Tabs cannot do).

function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn('relative z-10 flex items-stretch', className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 font-serif text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ink/35 focus-visible:ring-inset data-[state=on]:bg-card data-[state=on]:font-bold data-[state=on]:text-seal',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
