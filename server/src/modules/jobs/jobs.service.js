import winston from "winston";
import pool from "../../config/database.js";
import { validateCreateJob } from "./jobs.validator.js";
import { StatusCodes } from "http-status-codes";

export const saveJob = async (jobData) => {
    const { type, payload, priority = 2, scheduled_at, recurring_interval, max_retries = 0, dependencies = [] } = jobData;  
    const runAt = scheduled_at || null;
    
    // Validate dependency IDs exist 
    if (dependencies.length > 0) {
        const { rows } = await pool.query(
            `SELECT id FROM jobs WHERE id = ANY($1::uuid[])`,
            [dependencies]
        );
        if (rows.length !== dependencies.length) {
            return { statusCode: StatusCodes.UNPROCESSABLE_ENTITY, data: { status: 'error', message: 'One or more dependency job IDs do not exist' } };
        }
    }
    
    // Insert job 
    const { rows: [job] } = await pool.query(
        `INSERT INTO jobs
            (type, payload, priority, effective_priority, scheduled_at, run_at,
            recurring_interval, max_retries)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [type, payload, priority, priority, scheduled_at, runAt, recurring_interval, max_retries]
    );

    // Insert dependencies
    for (const depId of dependencies) {
        await pool.query(
            `INSERT INTO job_dependencies (job_id, depends_on) VALUES ($1, $2)`,
            [job.id, depId]
        );
    }
    
    // Log creation event 
    await logEvent(pool, {
        jobId:   job.id,
        event:   'job.created',
        level:   'info',
        message: `Job created: type=${type}, priority=${priority}`,
        metadata: { type, priority, scheduled_at, recurring_interval, dependency_count: dependencies.length }
    });

    winston.info(`Job created: { job_id: ${job.id}, type: ${type}, priority: ${priority}, scheduled_at: ${scheduled_at} }`);
    return { statusCode: StatusCodes.CREATED, data: { status: 'success', job } };
}

export async function logEvent(client, { jobId, event, level = 'info', message, metadata = {} }) {
  await client.query(
    `INSERT INTO job_logs (job_id, event, level, message, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [jobId, event, level, message, metadata]
  );
}