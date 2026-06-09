import winston from "winston";
import pool from "../config/database.js";
import logger from "../config/logger.js";

logger();

export const up = async () => {
    winston.info("Creating jobs table...");

    await pool.query(`
        CREATE TABLE jobs (
            id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

            type              VARCHAR(100)  NOT NULL,
            payload           JSONB         NOT NULL DEFAULT '{}',

            priority          SMALLINT      NOT NULL DEFAULT 2
                                CHECK (priority BETWEEN 1 AND 3),
            scheduled_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
            run_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

            recurring_interval  recurring_interval  NULL,
            next_run_at         TIMESTAMPTZ         NULL,

            status            job_status    NOT NULL DEFAULT 'pending',
            retry_count       SMALLINT      NOT NULL DEFAULT 0,
            max_retries       SMALLINT      NOT NULL DEFAULT 3,
            error_message     TEXT          NULL,

            created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
            started_at        TIMESTAMPTZ   NULL,
            completed_at      TIMESTAMPTZ   NULL,

            locked_at         TIMESTAMPTZ   NULL,

            effective_priority  NUMERIC(6, 2)  NOT NULL DEFAULT 2,

            heap_index        INTEGER       NULL
        );

        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$;

        CREATE TRIGGER trg_jobs_updated_at
            BEFORE UPDATE ON jobs
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
}

export const down = async () => {
    winston.info("Dropping jobs table...");

    await pool.query(`
        DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
        DROP FUNCTION IF EXISTS set_updated_at();
        DROP TABLE jobs;
    `);
}