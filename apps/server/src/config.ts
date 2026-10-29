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

export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  host: optional('HOST') ?? '0.0.0.0',
  port: positiveInt('PORT', 3001),
  tickRate: positiveInt('TICK_RATE', 10),
  map: {
    width: positiveInt('MAP_WIDTH', 64),
    height: positiveInt('MAP_HEIGHT', 64),
    seed: positiveInt('MAP_SEED', Math.floor(Math.random() * 2 ** 31) + 1),
  },
  allowedOrigins: (optional('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: optional('DATABASE_URL'),
  redisUrl: optional('REDIS_URL'),
};

export type Config = typeof config;
