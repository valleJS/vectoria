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
      hourCycle: 'h23',
    });
    formatters.set(timezone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAYS[parts.weekday ?? ''] ?? 0,
    hour: Number(parts.hour),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function isGameTime(schedule: Schedule, date: Date): boolean {
  const { weekday, hour } = partsIn(schedule.timezone, date);
  return schedule.days.includes(weekday) && hour >= schedule.startHour && hour < schedule.endHour;
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
