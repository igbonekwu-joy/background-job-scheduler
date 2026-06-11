import env from './env.js';

/** Neon/direct Postgres options for LISTEN/NOTIFY (not compatible with pooler). */
export function directPgConfig() {
  return {
    connectionString: env.DATABASE_URL_DIRECT,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  };
}
