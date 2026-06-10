import winston from "winston";
import pool from "../../config/database.js";
import { StatusCodes } from "http-status-codes";

export const saveJob = async (jobData) => {
    const { type, payload, priority = 2, scheduled_at, recurring_interval, max_retries = 3, dependencies = [] } = jobData;
    const runAt = scheduled_at || null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (dependencies.length > 0) {
            const { rows } = await client.query(
                `SELECT id FROM jobs WHERE id = ANY($1::uuid[])`,
                [dependencies]
            );
            if (rows.length !== dependencies.length) {
                await client.query('ROLLBACK');
                return { statusCode: StatusCodes.UNPROCESSABLE_ENTITY, data: { status: 'error', message: 'One or more dependency job IDs do not exist' } };
            }
        }

        const { rows: [job] } = await client.query(
            `INSERT INTO jobs
                (type, payload, priority, effective_priority, scheduled_at, run_at,
                recurring_interval, max_retries)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [type, payload, priority, priority, scheduled_at, runAt, recurring_interval, max_retries]
        );

        for (const depId of dependencies) {
            await client.query(
                `INSERT INTO job_dependencies (job_id, depends_on) VALUES ($1, $2)`,
                [job.id, depId]
            );
        }

        await logEvent(client, {
            jobId:   job.id,
            event:   'job.created',
            level:   'info',
            message: `Job created: type=${type}, priority=${priority}`,
            metadata: { type, priority, scheduled_at, recurring_interval, dependency_count: dependencies.length }
        });

        await client.query('COMMIT');
        winston.info(`Job created: { job_id: ${job.id}, type: ${type}, priority: ${priority}, scheduled_at: ${scheduled_at} }`);
        return { statusCode: StatusCodes.CREATED, data: { status: 'success', message: 'Job created successfully', job } };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

export const fetchJobs = async ({ status, limit, offset }) => {
    const params = [];
    let where = '';

    if (status) {
        params.push(status);
        where = `WHERE j.status = $${params.length}`;
    }

    params.push(limit, offset);

    const { rows } = await pool.query(
        `SELECT
            j.*,
            COALESCE(
                json_agg(jd.depends_on) FILTER (WHERE jd.depends_on IS NOT NULL),
                '[]'
            ) AS dependencies
        FROM jobs j
        LEFT JOIN job_dependencies jd ON jd.job_id = j.id
        ${where}
        GROUP BY j.id
        ORDER BY j.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
    );
    return { statusCode: StatusCodes.OK, data: { status: 'success', count: rows.length, jobs: rows } };
}

export const fetchJobById = async (id) => {
    const { rows: [job] } = await pool.query(
        `SELECT
        j.*,
        COALESCE(
            json_agg(jd.depends_on) FILTER (WHERE jd.depends_on IS NOT NULL),
            '[]'
        ) AS dependencies
        FROM jobs j
        LEFT JOIN job_dependencies jd ON jd.job_id = j.id
        WHERE j.id = $1
        GROUP BY j.id`,
    [id]
    );

    if (!job) {
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: 'Job not found' } };
    }
    return { statusCode: StatusCodes.OK, data: { status: 'success', job } };
}

export const fetchJobLogs = async (jobId, { limit = 200 }) => {
    const job = await fetchJobById(jobId);
    if (job.data.status === 'error') {
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: 'Job not found' } };
    }

    const { rows } = await pool.query(
        `SELECT * FROM job_logs
            WHERE job_id = $1
            ORDER BY created_at ASC
            LIMIT $2`,
        [jobId, limit]
    );
    return { statusCode: StatusCodes.OK, data: { status: 'success', logs: rows } };
}

export const cancelJobById = async (id) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [job] } = await client.query(
            `SELECT id, status FROM jobs WHERE id = $1 FOR UPDATE`,
            [id]
        );

        if (!job) {
            await client.query('ROLLBACK');
            return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: `Job ${id} not found` } };
        }

        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            await client.query('ROLLBACK');
            return { statusCode: StatusCodes.BAD_REQUEST, data: { status: 'error', message: `Cannot cancel a job with status of '${job.status}'` } };
        }

        const { rows: [updated] } = await client.query(
            `UPDATE jobs SET status = 'cancelled' WHERE id = $1 RETURNING *`,
            [id]
        );

        await logEvent(client, {
            jobId:   id,
            event:   'job.cancelled',
            level:   'warn',
            message: `Job cancelled (was ${job.status})`,
            metadata: { previous_status: job.status }
        });

        await client.query('COMMIT');
        winston.info(`Job cancelled: { job_id: ${id}, previous_status: ${job.status} }`);
        return { statusCode: StatusCodes.OK, data: { status: 'success', message: 'Job cancelled successfully', job: updated } };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

export const fetchStats = async () => {
    const { rows: statusRows } = await pool.query(
        `SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status`
    );

    const { rows: [dlqRow] } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM dead_letter_queue WHERE resolved = FALSE`
    );

    const stats = { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const row of statusRows) stats[row.status] = row.count;
    stats.dlq_unresolved = dlqRow.count;

    return { statusCode: StatusCodes.OK, data: { status: 'success', stats } };
}

export const logEvent = async (client, { jobId, event, level = 'info', message, metadata = {} }) => {
  await client.query(
    `INSERT INTO job_logs (job_id, event, level, message, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [jobId, event, level, message, metadata]
  );
}
