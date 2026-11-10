import { dirname, join } from 'node:path';

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

const vapidPublicKey = optional('VAPID_PUBLIC_KEY');
const vapidPrivateKey = optional('VAPID_PRIVATE_KEY');
if (Boolean(vapidPublicKey) !== Boolean(vapidPrivateKey)) {
  throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together');
}

const smtpHost = optional('SMTP_HOST');
if (isProduction && !smtpHost) throw new Error('SMTP_HOST must be set in production (email login)');

const mailFrom = optional('MAIL_FROM') ?? 'Vectoria <vectoria@localhost>';
const publicUrl = optional('PUBLIC_URL')?.replace(/\/+$/, '');

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
    victoryPointsToWin: positiveInt('VICTORY_POINTS_TO_WIN', 12),
  },
  dataFile: optional('DATA_FILE') ?? 'data/game.json',
  /**
   * Save backups (`deploy.sh`, daily cron) the admin's outpost-level replay reads; default
   * `backups/` next to the data directory (`/backups` in the container, mounted read-only).
   */
  backupDir:
    optional('BACKUP_DIR') ??
    join(dirname(optional('DATA_FILE') ?? 'data/game.json'), '..', 'backups'),
  /** Built client to serve on non-API paths (production container); unset = API only. */
  clientDir: optional('CLIENT_DIR'),
  allowedOrigins: (optional('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** Unset = login codes are printed to the server log instead of emailed (dev only). */
  smtp: smtpHost
    ? {
        host: smtpHost,
        port: positiveInt('SMTP_PORT', 587),
        /** true = TLS from the start (port 465); false = STARTTLS upgrade. */
        secure: oneOf('SMTP_SECURE', ['true', 'false'] as const, 'false') === 'true',
        user: optional('SMTP_USER'),
        pass: optional('SMTP_PASS'),
      }
    : null,
  mailFrom,
  /** Base URL for login links in emails; falls back to the request's Origin header. */
  publicUrl,
  /**
   * Web Push: the server's VAPID key pair (unset = generated once into `vapid.json` next to
   * DATA_FILE) and the contact push services may reach the operator at (`mailto:` or https).
   */
  vapid: {
    publicKey: vapidPublicKey,
    privateKey: vapidPrivateKey,
    subject:
      optional('VAPID_SUBJECT') ??
      (publicUrl?.startsWith('https://')
        ? publicUrl
        : `mailto:${/<([^>]+)>/.exec(mailFrom)?.[1] ?? mailFrom}`),
  },
  /**
   * Where `/source` redirects (AGPL-3.0 §13: players must be offered the running code).
   * Forks that change the code must point this at their own repository.
   */
  sourceUrl: optional('SOURCE_URL') ?? 'https://github.com/valleJS/vectoria',
  databaseUrl: optional('DATABASE_URL'),
  redisUrl: optional('REDIS_URL'),
};

export type Config = typeof config;
