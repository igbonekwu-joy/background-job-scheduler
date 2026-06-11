import winston from 'winston';
import pool from '../config/database.js';
import logger from "../config/logger.js";

logger();

const MIGRATION_NAMES = [
    'enums',
    'jobs',
    'job_dependencies',
    'dead_letter_queue',
    'job_logs',
    'indexes',
    'job_name',
];

const migrations = MIGRATION_NAMES.map((name, index) => ({
    name,
    legacyName: `00${index + 1}`,
    load: () => import(`./${name}.migration.js`),
}));

async function migrate(direction = 'up') {
  try {
    winston.info(`Running ${direction} migrations...`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id         SERIAL PRIMARY KEY,
            name       TEXT NOT NULL UNIQUE,
            run_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    if (direction === 'up') {
      for (const migration of migrations) {
        const { name, legacyName } = migration;
        const { rowCount } = await pool.query(
          'SELECT 1 FROM schema_migrations WHERE name = $1 OR name = $2',
          [name, legacyName]
        );
        if (rowCount > 0) {
          winston.info(`[skip] migration ${name} already applied`);
          continue;
        }
        const mod = await migration.load();
        await pool.query('BEGIN');
        await mod.up();
        await pool.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)', [name]
        );
        await pool.query('COMMIT');
        winston.info(`[done] migration ${name} applied`);
      }
    }

    if (direction === 'down') {
      for (let i = migrations.length - 1; i >= 0; i--) {
        const { name, legacyName } = migrations[i];
        const mod = await migrations[i].load();
        await pool.query('BEGIN');
        await mod.down();
        await pool.query(
          'DELETE FROM schema_migrations WHERE name = $1 OR name = $2',
          [name, legacyName]
        );
        await pool.query('COMMIT');
        winston.info(`[done] migration ${name} rolled back`);
      }
    }
  } catch (err) {
    await pool.query('ROLLBACK');
    winston.error('[error] migration failed, rolled back:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const direction = process.argv[2] === 'down' ? 'down' : 'up';
migrate(direction);
