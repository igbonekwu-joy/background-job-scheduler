import winston from "winston";
import pool from "../config/database.js";
import logger from "../config/logger.js";

logger();

export const up = async () => {
    winston.info("Creating job_dependencies table...");

    await pool.query(`
        CREATE TABLE job_dependencies (
            job_id              UUID  NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            depends_on          UUID  NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

            PRIMARY KEY (job_id, depends_on),
                -- a job cannot depend on itself
            CONSTRAINT no_self_dependency CHECK (job_id <> depends_on)
        );

        CREATE INDEX idx_job_deps_on_dependency
            ON job_dependencies (depends_on);
    `);
}

export const down = async () => {
    winston.info("Dropping job_dependencies table...");

    await pool.query(`
        DROP TABLE job_dependencies;
    `);
}