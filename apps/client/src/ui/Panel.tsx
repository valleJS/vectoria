import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Parchment sheet with a double ink rule. */
export function Panel({
  title,
  icon,
  className = '',
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`pointer-events-auto border border-ink bg-parchment p-[3px] text-sm text-ink shadow-[2px_3px_0_rgba(59,42,24,0.35)] ${className}`}
    >
      <div className="border border-ink/40 px-3 py-2">
        {title && (
          <div className="mb-1.5 flex items-center gap-2 text-base italic">
            {icon}
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
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

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'selected';
}) {
  const styles = {
    default: 'border-ink/60 bg-parchment-deep/70 text-ink hover:bg-parchment-deep',
    primary: 'border-ink bg-seal text-parchment hover:bg-seal-light',
    danger: 'border-ink bg-[#6e1f14] text-parchment hover:bg-seal',
    selected: 'border-ink bg-ink text-parchment',
  }[variant];
  return (
    <button
      type="button"
      className={`border px-2.5 py-1 font-serif text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
}
