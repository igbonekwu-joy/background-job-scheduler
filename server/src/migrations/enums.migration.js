import winston from "winston";
import pool from "../config/database.js";
import logger from "../config/logger.js";

logger();

export const up = async () => {
    winston.info("Creating enums...");

    await pool.query(`
        CREATE TYPE job_status AS ENUM (
            'pending',
            'processing',
            'completed',
            'failed',
            'cancelled'
        );

        CREATE TYPE job_log_level AS ENUM (
            'info',
            'warn',
            'error'
        );

        CREATE TYPE recurring_interval AS ENUM (
            'every_1_minute',
            'every_5_minutes',
            'every_1_hour'
        );
    `);
}

export const down = async () => {
    winston.info("Dropping enums...");

    await pool.query(`
        DROP TYPE job_status;
        DROP TYPE job_log_level;
        DROP TYPE recurring_interval;
    `);
}