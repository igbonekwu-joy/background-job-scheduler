import winston from "winston";
import pool from "../../config/database.js";
import { publishJobEvent } from "../../utils/jobEvents.js";
import { findDependencyCycle } from "./dependencyCycle.js";
import { NotFoundError, BadRequestError, UnprocessableError } from "../../utils/errors.js";

export const saveJob = async (jobData) => {
    const { name, type, payload, priority = 2, scheduled_at, recurring_interval, max_retries = 3, dependencies = [] } = jobData;
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
                throw new UnprocessableError('One or more dependency job IDs do not exist');
            }
        }

        const { rows: [job] } = await client.query(
            `INSERT INTO jobs
                (name, type, payload, priority, effective_priority, scheduled_at, run_at,
                recurring_interval, max_retries)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [name, type, payload, priority, priority, scheduled_at, runAt, recurring_interval, max_retries]
        );

        if (dependencies.length > 0) {
            const cyclicDep = await findDependencyCycle(client, job.id, dependencies);
            if (cyclicDep) {
                await client.query('ROLLBACK');
                throw new UnprocessableError('Dependency cycle detected');
            }
        }

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
            message: `Job created: name=${name}, type=${type}, priority=${priority}`,
            metadata: { name, type, priority, scheduled_at, recurring_interval, dependency_count: dependencies.length }
        });

        await client.query('COMMIT');
        publishJobEvent({ status: 'pending', job_id: job.id, type: job.type }).catch(() => {});
        winston.info(`Job created: { job_id: ${job.id}, type: ${type}, priority: ${priority}, scheduled_at: ${scheduled_at} }`);
        return job;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

function buildJobsListWhere({ status, search }) {
    const conditions = [];
    const params = [];

    if (status) {
        params.push(status);
        conditions.push(`j.status = $${params.length}`);
    }

    const term = search?.trim();
    if (term) {
        params.push(`%${term}%`);
        const placeholder = `$${params.length}`;
        conditions.push(`(
            j.name ILIKE ${placeholder}
            OR j.type ILIKE ${placeholder}
            OR j.id::text ILIKE ${placeholder}
            OR j.status::text ILIKE ${placeholder}
        )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
}

export const fetchJobs = async ({ status, search, page = 1, limit = 20 }) => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const { where, params } = buildJobsListWhere({ status, search });

    const { rows: [{ total_jobs }] } = await pool.query(
        `SELECT COUNT(*)::int AS total_jobs FROM jobs j ${where}`,
        params
    );

    const offset = (safePage - 1) * safeLimit;
    const listParams = [...params, safeLimit, offset];

    const { rows } = await pool.query(
        `SELECT
            j.*,
            COALESCE(
                json_agg(
                    json_build_object('id', dep.id, 'name', dep.name)
                    ORDER BY dep.created_at
                ) FILTER (WHERE dep.id IS NOT NULL),
                '[]'
            ) AS dependencies
        FROM jobs j
        LEFT JOIN job_dependencies jd ON jd.job_id = j.id
        LEFT JOIN jobs dep ON dep.id = jd.depends_on
        ${where}
        GROUP BY j.id
        ORDER BY j.created_at DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
    );

    return { rows, page: safePage, limit: safeLimit, total_jobs, search: search?.trim() || undefined };
}

export const fetchJobById = async (id) => {
    const { rows: [job] } = await pool.query(
        `SELECT
        j.*,
        COALESCE(
            json_agg(
                json_build_object('id', dep.id, 'name', dep.name)
                ORDER BY dep.created_at
            ) FILTER (WHERE dep.id IS NOT NULL),
            '[]'
        ) AS dependencies
        FROM jobs j
        LEFT JOIN job_dependencies jd ON jd.job_id = j.id
        LEFT JOIN jobs dep ON dep.id = jd.depends_on
        WHERE j.id = $1
        GROUP BY j.id`,
    [id]
    );

    if (!job) {
        throw new NotFoundError('Job not found');
    }
    return job;
}

function buildLogsWhere({ job_id, event, level }) {
    const conditions = [];
    const params = [];

    if (job_id) {
        params.push(job_id);
        conditions.push(`job_id = $${params.length}`);
    }
    if (event) {
        params.push(event);
        conditions.push(`event = $${params.length}`);
    }
    if (level) {
        params.push(level);
        conditions.push(`level = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
}

export const fetchAllJobLogs = async ({
    job_id,
    event,
    level,
    page = 1,
    limit = 20,
}) => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const { where, params } = buildLogsWhere({ job_id, event, level });

    const { rows: [{ total_logs }] } = await pool.query(
        `SELECT COUNT(*)::int AS total_logs FROM job_logs ${where}`,
        params
    );

    const offset = (safePage - 1) * safeLimit;
    const listParams = [...params, safeLimit, offset];

    const { rows } = await pool.query(
        `SELECT * FROM job_logs
            ${where}
            ORDER BY created_at DESC
            LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
    );

    const filters = {};
    if (job_id) filters.job_id = job_id;
    if (event) filters.event = event;
    if (level) filters.level = level;

    return { rows, page: safePage, limit: safeLimit, total_logs, filters };
};

export const fetchJobLogs = async (jobId, { page = 1, limit = 20, event, level } = {}) => {
    await fetchJobById(jobId);

    return fetchAllJobLogs({
        job_id: jobId,
        event,
        level,
        page,
        limit,
    });
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
            throw new NotFoundError(`Job ${id} not found`);
        }

        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            await client.query('ROLLBACK');
            throw new BadRequestError(`Cannot cancel a job with status of '${job.status}'`);
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
        publishJobEvent({ status: 'cancelled', job_id: updated.id, type: updated.type }).catch(() => {});
        winston.info(`Job cancelled: { job_id: ${id}, previous_status: ${job.status} }`);
        return updated;
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

    return stats;
}

export const logEvent = async (client, { jobId, event, level = 'info', message, metadata = {} }) => {
  await client.query(
    `INSERT INTO job_logs (job_id, event, level, message, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [jobId, event, level, message, metadata]
  );
}
