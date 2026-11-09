/**
 * Real-world gameday schedule: Monday–Friday, 10:00–18:00 in a fixed time zone. The game clock
 * only advances inside these windows, so "10 gameday hours" can span two calendar days.
 */
export interface Schedule {
  timezone: string;
  /** ISO weekdays, 1 = Monday. */
  days: readonly number[];
  startHour: number;
  endHour: number;
  /** Calendar days (YYYY-MM-DD in `timezone`) without a gameday, set by the admin. */
  breakDays?: readonly string[];
}

export const WEEKDAY_SCHEDULE = {
  days: [1, 2, 3, 4, 5],
  startHour: 10,
  endHour: 18,
} as const;

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(timezone: string, date: Date) {
  let format = formatters.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAYS[parts.weekday ?? ''] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function isGameTime(schedule: Schedule, date: Date): boolean {
  const { weekday, hour, dayKey } = partsIn(schedule.timezone, date);
  return (
    schedule.days.includes(weekday) &&
    hour >= schedule.startHour &&
    hour < schedule.endHour &&
    !schedule.breakDays?.includes(dayKey)
  );
}

/** Calendar date (YYYY-MM-DD in the schedule's zone) — identifies one gameday. */
export function dayKey(schedule: Schedule, date: Date): string {
  return partsIn(schedule.timezone, date).dayKey;
}

const STEP_MS = 60_000;

/**
 * Gameday milliseconds between two instants, at one-minute resolution. Used to catch the clock
 * up after the server was down.
 */
export function gameTimeBetween(schedule: Schedule, fromMs: number, toMs: number): number {
  let total = 0;
  for (let t = fromMs; t < toMs; t += STEP_MS) {
    if (isGameTime(schedule, new Date(t))) total += Math.min(STEP_MS, toMs - t);
  }
  return total;
}

/**
 * First instant at or after `fromMs` inside the gameday hours (one-minute resolution); `fromMs`
 * itself when none comes within `maxDays`.
 */
export function nextGameTime(schedule: Schedule, fromMs: number, maxDays = 8): number {
  const start = Math.ceil(fromMs / STEP_MS) * STEP_MS;
  for (let t = start; t < fromMs + maxDays * 86_400_000; t += STEP_MS) {
    if (isGameTime(schedule, new Date(t))) return t;
  }
  return fromMs;
}

/**
 * Real instant at which `gameMs` more game-clock milliseconds have passed, starting at `fromMs`:
 * the clock runs `timeScale` game ms per real ms, and only inside the schedule's hours (break days
 * skipped). Walks whole windows and hours, not minutes, so it is cheap enough to call per render.
 * Assumes the time zone's offset is a whole number of hours. Null if it lies beyond `maxDays`.
 */
export function realTimeAfter(
  schedule: Schedule,
  fromMs: number,
  gameMs: number,
  timeScale = 1,
  maxDays = 21,
): number | null {
  let left = Math.max(0, gameMs) / timeScale;
  let t = fromMs;
  const limit = fromMs + maxDays * 86_400_000;
  while (t < limit) {
    const { hour, minute, second } = partsIn(schedule.timezone, new Date(t));
    const toHour = (60 - minute) * 60_000 - second * 1000 - (t % 1000);
    if (isGameTime(schedule, new Date(t))) {
      const window = (schedule.endHour - hour - 1) * 3_600_000 + toHour;
      if (left <= window) return t + left;
      left -= window;
      t += window;
    } else {
      t += toHour;
    }
  }
  return null;
}
