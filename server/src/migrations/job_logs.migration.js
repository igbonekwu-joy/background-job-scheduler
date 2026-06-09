import winston from "winston";
import logger from "../config/logger.js";
import pool from "../config/database.js";

logger();

export const up = async () => {
    winston.info("Creating job logs table...");

    await pool.query(`
        CREATE TABLE job_logs (
            id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id      UUID            NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

            event       VARCHAR(50)     NOT NULL,   -- 'job.created' | 'job.started' | 'job.retry' | etc.
            level       job_log_level   NOT NULL DEFAULT 'info',
            message     TEXT            NOT NULL,
            metadata    JSONB           NOT NULL DEFAULT '{}',   -- worker_id, attempt, error stack, etc.

            created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_job_logs_job_id
            ON job_logs (job_id, created_at DESC);
    `);
}

export const down = async () => {
    winston.info("Dropping job logs table...");

    await pool.query(`
        DROP TABLE job_logs;
    `);
}