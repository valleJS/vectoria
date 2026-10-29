import { log } from '../logger';

const MAX_BEHIND_TICKS = 5;

/**
 * Fixed-rate tick scheduler. Uses self-correcting setTimeout so ticks don't drift; if the process
 * stalls for more than a few ticks it skips ahead instead of running a burst of catch-up ticks.
 */
export class GameLoop {
  private readonly intervalMs: number;
  private readonly onTick: (dtMs: number) => void;
  private timer: NodeJS.Timeout | undefined;
  private nextAt = 0;
  private lastAt = 0;

  constructor(tickRate: number, onTick: (dtMs: number) => void) {
    this.intervalMs = 1000 / tickRate;
    this.onTick = onTick;
  }

  start(): void {
    if (this.timer) return;
    this.lastAt = performance.now();
    this.nextAt = this.lastAt + this.intervalMs;
    this.timer = setTimeout(this.step, this.intervalMs);
  }

  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private readonly step = (): void => {
    const now = performance.now();
    try {
      this.onTick(now - this.lastAt);
    } catch (error) {
      log.error('Tick failed', error);
    }
    this.lastAt = now;

    this.nextAt += this.intervalMs;
    if (now - this.nextAt > this.intervalMs * MAX_BEHIND_TICKS) {
      log.warn(`Game loop fell behind by ${Math.round(now - this.nextAt)}ms; skipping ahead`);
      this.nextAt = now + this.intervalMs;
    }
    if (this.timer)
      this.timer = setTimeout(this.step, Math.max(0, this.nextAt - performance.now()));
  };
}
