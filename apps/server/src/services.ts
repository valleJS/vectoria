import { Redis } from 'ioredis';
import type { Config } from './config';
import { createDatabase, type Database } from './db/client';
import { log } from './logger';

export interface Services {
  db: Database | null;
  redis: Redis | null;
  close(): Promise<void>;
}

/**
 * Connects to Postgres and Redis when their URLs are configured. Each is optional so the game
 * server runs standalone in development; a configured service that fails to connect is fatal.
 */
export async function connectServices(config: Config): Promise<Services> {
  let database: ReturnType<typeof createDatabase> | null = null;
  let redis: Redis | null = null;

  try {
    if (config.databaseUrl) {
      database = createDatabase(config.databaseUrl);
      await database.pool.query('select 1');
      log.info('Connected to PostgreSQL');
    } else {
      log.warn('DATABASE_URL not set; running without PostgreSQL');
    }

    if (config.redisUrl) {
      redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
      await redis.connect();
      log.info('Connected to Redis');
    } else {
      log.warn('REDIS_URL not set; running without Redis');
    }
  } catch (error) {
    await database?.pool.end().catch(() => {});
    redis?.disconnect();
    throw error;
  }

  return {
    db: database?.db ?? null,
    redis,
    async close() {
      await Promise.allSettled([database?.pool.end(), redis?.quit()]);
    },
  };
}
