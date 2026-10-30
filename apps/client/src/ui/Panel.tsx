import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Panel({
  title,
  className = '',
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`pointer-events-auto rounded-lg border border-white/10 bg-slate-900/85 px-3 py-2 text-sm shadow-lg backdrop-blur ${className}`}
    >
      {title && (
        <div className="mb-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' }) {
  const styles = {
    default: 'bg-slate-700 hover:bg-slate-600',
    primary: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
    danger: 'bg-rose-700 hover:bg-rose-600',
  }[variant];
  return (
    <button
      type="button"
      className={`rounded px-2.5 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
}
