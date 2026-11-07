import { SOURCE_HREF } from '../net/api';
import { cn } from '@/lib/utils';

/**
 * Offers players the source of the running server and client. Required by AGPL-3.0 §13 for
 * anyone who hosts the game, so keep it reachable from every screen family (join/lobby, handbook).
 */
export function SourceLink({ className }: { className?: string }) {
  return (
    <a
      href={SOURCE_HREF}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'text-xs text-ink-soft underline-offset-2 hover:text-seal hover:underline',
        className,
      )}
    >
      Quellcode (AGPL-3.0)
    </a>
  );
}
