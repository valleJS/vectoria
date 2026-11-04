import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui tabs as index tabs on a parchment sheet: the active one is lifted and sealed red.

function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col', className)} {...props} />
  );
}

function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex shrink-0 border-b border-ink bg-muted', className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'flex flex-1 cursor-pointer items-center justify-center gap-1 border-r border-ink/25 px-1 py-1.5 text-muted-foreground transition-colors outline-none last:border-r-0 hover:bg-accent/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset data-[state=active]:-mb-px data-[state=active]:border-b-2 data-[state=active]:border-b-seal data-[state=active]:bg-card data-[state=active]:font-bold data-[state=active]:text-ink',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('min-h-0 flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
