import winston from "winston";
import logger from "../config/logger.js";
import pool from "../config/database.js";

logger();

export const up = async () => {
    winston.info("Creating dead letter queue table...");

    await pool.query(`
        CREATE TABLE dead_letter_queue (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id          UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

            -- full snapshot of the payload at time of final failure
            job_snapshot    JSONB       NOT NULL DEFAULT '{}',
            failure_reason  TEXT        NOT NULL,
            failed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- set when a job triggers a manual retry from the DLQ view
            retried_at      TIMESTAMPTZ NULL,
            retried_by      TEXT        NULL,       

            -- resolved = true once the retried job completes successfully
            resolved        BOOLEAN     NOT NULL DEFAULT FALSE,
            resolved_at     TIMESTAMPTZ NULL
        );

        -- fast lookup of all unresolved entries (drives the DLQ dashboard + alert)
        CREATE INDEX idx_dlq_unresolved
            ON dead_letter_queue (resolved, failed_at DESC)
            WHERE resolved = FALSE;

        COMMENT ON TABLE dead_letter_queue IS
            'DLQ_ALERT_THRESHOLD = 10. When COUNT(*) WHERE resolved=false crosses 10, an email alert fires.';
    `);
}

export const down = async () => {
    winston.info("Dropping dead letter queue table...");

    await pool.query(`
        DROP TABLE dead_letter_queue;
    `);
}