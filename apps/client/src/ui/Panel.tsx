import type { ComponentProps, ReactNode } from 'react';
import { Button as UiButton } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Game-facing wrappers over the shadcn/ui primitives (src/components/ui), so HUD code keeps one
// small vocabulary: Panel, SectionLabel, Button.

/** Parchment sheet with a double ink rule (shadcn Card). */
export function Panel({
  title,
  icon,
  className = '',
  contentClassName,
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  className?: string;
  /** Classes for the body inside the inner rule (padding goes here, not on the sheet). */
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('pointer-events-auto', className)}>
      {title && (
        <CardHeader className="pb-0">
          <CardTitle>
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(title && 'pt-1.5', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

/** Small-caps section label inside a panel. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 mb-1 border-b border-ink/25 pb-0.5 text-xs tracking-wider text-ink-soft uppercase">
      {children}
    </div>
  );
}

const VARIANTS = {
  default: 'default',
  primary: 'primary',
  danger: 'destructive',
  selected: 'selected',
  ghost: 'ghost',
  outline: 'outline',
  link: 'link',
  plain: 'plain',
} as const;

/**
 * shadcn Button with the game's variants (`danger` = destructive, `selected` = toggled on,
 * `plain` = no chrome for illustrated buttons).
 */
export function Button({
  variant = 'default',
  size,
  ...props
}: Omit<ComponentProps<typeof UiButton>, 'variant'> & {
  variant?: keyof typeof VARIANTS;
}) {
  return <UiButton variant={VARIANTS[variant]} size={size ?? 'compact'} {...props} />;
}

/** shadcn Tooltip around one element (which must accept a ref, e.g. Button or a span). */
export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
