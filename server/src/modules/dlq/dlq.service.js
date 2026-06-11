import pool from "../../config/database.js";
import env from "../../config/env.js";
import winston from "winston";
import { logEvent } from "../jobs/jobs.service.js";
import { sendEmail } from "../handlers/emailHandler.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";

const DLQ_ALERT_THRESHOLD = parseInt(env.DLQ_ALERT_THRESHOLD || '10');

export const getDlqEntries = async ({
    includeResolved = false,
    page = 1,
    limit = 10,
}) => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const where = includeResolved ? '' : 'WHERE resolved = FALSE';

    const { rows: [{ total_dlq }] } = await pool.query(
        `SELECT COUNT(*)::int AS total_dlq FROM dead_letter_queue ${where}`
    );

    const offset = (safePage - 1) * safeLimit;

    const resolvedFilter = includeResolved ? '' : 'WHERE dlq.resolved = FALSE';

    const { rows } = await pool.query(
        `SELECT dlq.*, j.name AS job_name
        FROM dead_letter_queue dlq
        LEFT JOIN jobs j ON j.id = dlq.job_id
        ${resolvedFilter}
        ORDER BY dlq.failed_at DESC
        LIMIT $1 OFFSET $2`,
        [safeLimit, offset]
    );

    return { rows, page: safePage, limit: safeLimit, total_dlq, includeResolved };
}

export const getDlqEntryById = async (id) => {
    const { rows: [entry] } = await pool.query(
        `SELECT * FROM dead_letter_queue WHERE id = $1`,
        [id]
    );
    if (!entry) {
        throw new NotFoundError('DLQ entry not found');
    }

    return entry;
}

export const retryFromDlq = async (dlqId, { retriedBy = 'engineer', payload } = {}) => {
  if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) {
    throw new BadRequestError('payload must be a JSON object');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: [entry] } = await client.query(
        `SELECT * FROM dead_letter_queue WHERE id = $1 FOR UPDATE`,
        [dlqId]
    );
    if (!entry) {
        await client.query('ROLLBACK');
        throw new NotFoundError(`DLQ entry ${dlqId} not found`);
    }

    const jobParams = payload !== undefined
      ? [entry.job_id, payload]
      : [entry.job_id];

    const { rows: [job] } = await client.query(
      `UPDATE jobs
      SET status        = 'pending',
          retry_count   = 0,
          error_message = NULL,
          run_at        = NOW(),
          scheduled_at  = NOW(),
          started_at    = NULL,
          completed_at  = NULL${payload !== undefined ? ',\n          payload = $2' : ''}
      WHERE id = $1
      RETURNING *`,
      jobParams
    );
    if (!job) {
        await client.query('ROLLBACK');
        throw new NotFoundError(`Original job ${entry.job_id} not found`);
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
      metadata: {
        dlq_id: dlqId,
        retried_by: retriedBy,
        ...(payload !== undefined && { payload_updated: true }),
      }
    });

    await client.query('COMMIT');
    winston.info('DLQ manual retry triggered', { dlq_id: dlqId, job_id: entry.job_id, retried_by: retriedBy });

    return { job, dlqEntry: entry };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    winston.error('DB error in retryFromDlq', { err });
    throw err;
  } finally {
    client.release();
  }
}

/** Update an existing unresolved DLQ row, or insert one if the job is not already queued. */
export const upsertDlqEntry = async (client, { jobId, jobSnapshot, failureReason }) => {
  const { rowCount } = await client.query(
    `UPDATE dead_letter_queue
     SET job_snapshot = $2,
         failure_reason = $3,
         failed_at = NOW()
     WHERE job_id = $1 AND resolved = FALSE`,
    [jobId, jobSnapshot, failureReason]
  );

  if (rowCount > 0) {
    return { inserted: false };
  }

  await client.query(
    `INSERT INTO dead_letter_queue (job_id, job_snapshot, failure_reason)
     VALUES ($1, $2, $3)`,
    [jobId, jobSnapshot, failureReason]
  );

  return { inserted: true };
};

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
