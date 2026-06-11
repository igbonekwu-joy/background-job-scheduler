import winston from "winston";
import pool from "../../config/database.js";
import { StatusCodes } from "http-status-codes";
import { publishJobEvent } from "../../utils/jobEvents.js";
import { findDependencyCycle } from "./dependencyCycle.js";
import { buildPageLinks } from "../../utils/pagination.js";

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

        if (dependencies.length > 0) {
            const cyclicDep = await findDependencyCycle(client, job.id, dependencies);
            if (cyclicDep) {
                await client.query('ROLLBACK');
                return {
                    statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
                    data: { status: 'error', message: 'Dependency cycle detected' },
                };
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
            message: `Job created: type=${type}, priority=${priority}`,
            metadata: { type, priority, scheduled_at, recurring_interval, dependency_count: dependencies.length }
        });

        await client.query('COMMIT');
        publishJobEvent({ status: 'pending', job_id: job.id, type: job.type }).catch(() => {});
        winston.info(`Job created: { job_id: ${job.id}, type: ${type}, priority: ${priority}, scheduled_at: ${scheduled_at} }`);
        return { statusCode: StatusCodes.CREATED, data: { status: 'success', message: 'Job created successfully', job } };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

export const fetchJobs = async ({ status, page = 1, limit = 20, linkBase = '/api/jobs' }) => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);

    const countParams = [];
    let where = '';

    if (status) {
        countParams.push(status);
        where = `WHERE j.status = $${countParams.length}`;
    }

    const { rows: [{ total_jobs }] } = await pool.query(
        `SELECT COUNT(*)::int AS total_jobs FROM jobs j ${where}`,
        countParams
    );

    const total = total_jobs === 0 ? 0 : Math.ceil(total_jobs / safeLimit);
    const offset = (safePage - 1) * safeLimit;

    const listParams = [...countParams, safeLimit, offset];

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
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
    );

    return {
        statusCode: StatusCodes.OK,
        data: {
            status: 'success',
            page: safePage,
            limit: safeLimit,
            total,
            total_jobs,
            links: buildPageLinks(linkBase, { page: safePage, limit: safeLimit, status, total }),
            data: rows,
        },
    };
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
    linkBase = '/api/jobs/all/logs',
}) => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const { where, params } = buildLogsWhere({ job_id, event, level });

    const { rows: [{ total_logs }] } = await pool.query(
        `SELECT COUNT(*)::int AS total_logs FROM job_logs ${where}`,
        params
    );

    const total = total_logs === 0 ? 0 : Math.ceil(total_logs / safeLimit);
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

    return {
        statusCode: StatusCodes.OK,
        data: {
            status: 'success',
            page: safePage,
            limit: safeLimit,
            total,
            total_logs,
            links: buildPageLinks(linkBase, {
                page: safePage,
                limit: safeLimit,
                total,
                filters,
            }),
            data: rows,
        },
    };
};

export const fetchJobLogs = async (jobId, { page = 1, limit = 20, event, level, linkBase }) => {
    const job = await fetchJobById(jobId);
    if (job.data.status === 'error') {
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: 'Job not found' } };
    }

    return fetchAllJobLogs({
        job_id: jobId,
        event,
        level,
        page,
        limit,
        linkBase: linkBase ?? `/api/jobs/${jobId}/logs`,
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
        publishJobEvent({ status: 'cancelled', job_id: updated.id, type: updated.type }).catch(() => {});
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
