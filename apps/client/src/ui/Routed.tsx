import type { ReactNode } from 'react';
import { useRouted } from '../state/routed';

/** Greys out its children and takes them out of reach while the player is routed. */
export function Locked({ children, className = '' }: { children: ReactNode; className?: string }) {
  const routed = useRouted();
  return (
    <div
      inert={routed}
      title={routed ? 'Handlungsunfähig, bis alle Truppen daheim sind' : undefined}
      className={`${routed ? 'opacity-45 grayscale select-none' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
