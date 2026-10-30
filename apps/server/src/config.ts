try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the process environment.
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function positiveInt(name: string, fallback: number): number {
  const raw = optional(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

function positiveNumber(name: string, fallback: number): number {
  const raw = optional(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return value;
}

function oneOf<T extends string>(name: string, values: readonly T[], fallback: T): T {
  const raw = optional(name);
  if (raw === undefined) return fallback;
  if (!values.includes(raw as T)) {
    throw new Error(`${name} must be one of ${values.join(', ')}, got "${raw}"`);
  }
  return raw as T;
}

const isProduction = process.env.NODE_ENV === 'production';
const adminToken = optional('ADMIN_TOKEN') ?? (isProduction ? undefined : 'admin');
if (!adminToken) throw new Error('ADMIN_TOKEN must be set in production');

export const config = {
  isProduction,
  host: optional('HOST') ?? '0.0.0.0',
  port: positiveInt('PORT', 3001),
  tickRate: positiveInt('TICK_RATE', 5),
  mapSeed: positiveInt('MAP_SEED', Math.floor(Math.random() * 2 ** 31) + 1),
  adminToken,
  game: {
    /** `weekdays`: clock runs Mon–Fri 10–18 in GAME_TIMEZONE. `always`: clock always runs (dev). */
    hours: oneOf('GAME_HOURS', ['weekdays', 'always'] as const, 'weekdays'),
    timezone: optional('GAME_TIMEZONE') ?? 'Europe/Berlin',
    /** Game-clock speed multiplier for testing; 1 in production. */
    timeScale: positiveNumber('TIME_SCALE', 1),
    victoryPointsToWin: positiveInt('VICTORY_POINTS_TO_WIN', 25),
  },
  dataFile: optional('DATA_FILE') ?? 'data/game.json',
  allowedOrigins: (optional('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: optional('DATABASE_URL'),
  redisUrl: optional('REDIS_URL'),
};

export type Config = typeof config;
