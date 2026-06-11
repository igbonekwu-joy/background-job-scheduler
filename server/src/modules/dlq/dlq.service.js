import { StatusCodes } from "http-status-codes";
import pool from "../../config/database.js";
import env from "../../config/env.js";
import winston from "winston";
import { logEvent } from "../jobs/jobs.service.js";
import { sendEmail } from "../handlers/emailHandler.js";
import { buildPageLinks } from "../../utils/pagination.js";

const DLQ_ALERT_THRESHOLD = parseInt(env.DLQ_ALERT_THRESHOLD || '10');

export const getDlqEntries = async ({
    includeResolved = false,
    page = 1,
    limit = 10,
    linkBase = '/api/dlq',
}) => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const where = includeResolved ? '' : 'WHERE resolved = FALSE';

    const { rows: [{ total_dlq }] } = await pool.query(
        `SELECT COUNT(*)::int AS total_dlq FROM dead_letter_queue ${where}`
    );

    const total = total_dlq === 0 ? 0 : Math.ceil(total_dlq / safeLimit);
    const offset = (safePage - 1) * safeLimit;

    const { rows } = await pool.query(
        `SELECT * FROM dead_letter_queue
        ${where}
        ORDER BY failed_at DESC
        LIMIT $1 OFFSET $2`,
        [safeLimit, offset]
    );

    const filters = {};
    if (includeResolved) filters.include_resolved = 'true';

    return {
        statusCode: StatusCodes.OK,
        data: {
            status: 'success',
            page: safePage,
            limit: safeLimit,
            total,
            total_dlq,
            links: buildPageLinks(linkBase, {
                page: safePage,
                limit: safeLimit,
                total,
                filters,
            }),
            data: rows,
        },
    };
}

export const getDlqEntryById = async (id) => {
    const { rows: [entry] } = await pool.query(
        `SELECT * FROM dead_letter_queue WHERE id = $1`,
        [id]
    );
    if (!entry) {
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: 'DLQ entry not found' } };
    }

    return { statusCode: StatusCodes.OK, data: { success: true, data: entry  } };
}

export const retryFromDlq = async (dlqId, retriedBy = 'engineer') => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: [entry] } = await client.query(
        `SELECT * FROM dead_letter_queue WHERE id = $1 FOR UPDATE`,
        [dlqId]
    );
    if (!entry) {
        await client.query('ROLLBACK');
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: `DLQ entry ${dlqId} not found` } };
    }

    const { rows: [job] } = await client.query(
      `UPDATE jobs
      SET status        = 'pending',
          retry_count   = 0,
          error_message = NULL,
          run_at        = NOW(),
          scheduled_at  = NOW(),
          started_at    = NULL,
          completed_at  = NULL
      WHERE id = $1
      RETURNING *`,
      [entry.job_id]
    );
    if (!job) {
        await client.query('ROLLBACK');
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: `Original job ${entry.job_id} not found` } };
    }

    await client.query(
      `UPDATE dead_letter_queue
      SET retried_at = NOW(), retried_by = $1
      WHERE id = $2`,
      [retriedBy, dlqId]
    );

    await logEvent(client, {
      jobId:   entry.job_id,
      event:   'job.retry',
      level:   'warn',
      message: `Manual retry triggered from DLQ by ${retriedBy}`,
      metadata: { dlq_id: dlqId, retried_by: retriedBy }
    });

    await client.query('COMMIT');
    winston.info('DLQ manual retry triggered', { dlq_id: dlqId, job_id: entry.job_id, retried_by: retriedBy });

    return { statusCode: StatusCodes.OK, data: { status: 'success', message: 'Job retried successfully', job, dlqEntry: entry } };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    winston.error('DB error in retryFromDlq', { err });
    return { statusCode: StatusCodes.INTERNAL_SERVER_ERROR, data: { status: 'error', message: 'DB error in retryFromDlq' } };
  } finally {
    client.release();
  }
}

/** Mark the latest manually-retried DLQ entry resolved after its job completes. */
export const resolveDlqForJob = async (client, jobId) => {
  await client.query(
    `UPDATE dead_letter_queue
     SET resolved = TRUE, resolved_at = NOW()
     WHERE id = (
       SELECT id FROM dead_letter_queue
       WHERE job_id = $1 AND resolved = FALSE AND retried_at IS NOT NULL
       ORDER BY retried_at DESC
       LIMIT 1
     )`,
    [jobId]
  );
};

export const checkDlqThreshold = async () => {
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM dead_letter_queue WHERE resolved = FALSE`
  );

  if (count >= DLQ_ALERT_THRESHOLD) {
    await sendEmail({
      id: 'dlq-alert',
      payload: {
        to: process.env.DLQ_ALERT_EMAIL || 'engineering@dilamme.io',
        subject: `DLQ alert: ${count} unresolved entries (threshold ${DLQ_ALERT_THRESHOLD})`,
      },
    }).catch((err) => {
      winston.warn('DLQ alert email failed', { error: err.message });
    });
  }
  return count;
}
