import winston from "winston";
import logger from "../config/logger.js";
import pool from "../config/database.js";

logger();

export const up = async () => {
    winston.info("Creating indexes...");

    await pool.query(`
        -- worker polling: fetch the next N jobs due to run, ordered by
        -- effective_priority ASC, run_at ASC, created_at ASC
        -- (mirrors the heap ordering defined in the spec)
        CREATE INDEX idx_jobs_worker_poll
            ON jobs (effective_priority ASC, run_at ASC, created_at ASC)
            WHERE status = 'pending';

        -- scheduler: find scheduled jobs whose time has come
        CREATE INDEX idx_jobs_due_scheduled
            ON jobs (run_at ASC)
            WHERE status = 'pending' AND run_at IS NOT NULL;

        -- scheduler: find recurring jobs that need their next run queued
        CREATE INDEX idx_jobs_recurring
            ON jobs (next_run_at ASC)
            WHERE status = 'completed' AND recurring_interval IS NOT NULL;

        -- status-based lookups (dashboard counts)
        CREATE INDEX idx_jobs_status
            ON jobs (status, created_at DESC);

        -- starvation prevention: batch-update effective_priority for old pending jobs
        CREATE INDEX idx_jobs_starvation
            ON jobs (created_at ASC)
            WHERE status = 'pending';
    `);
}

export const down = async () => {
    winston.info("Dropping indexes...");
    await pool.query(`
        DROP INDEX IF EXISTS idx_jobs_worker_poll;
        DROP INDEX IF EXISTS idx_jobs_due_scheduled;
        DROP INDEX IF EXISTS idx_jobs_recurring;
        DROP INDEX IF EXISTS idx_jobs_status;
        DROP INDEX IF EXISTS idx_jobs_starvation;
    `);
}