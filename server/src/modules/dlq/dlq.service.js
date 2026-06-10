import { StatusCodes } from "http-status-codes";
import pool from "../../config/database.js";
import env from "../../config/env.js";
import winston from "winston";
import { logEvent } from "../jobs/jobs.service.js";
import { sendEmail } from "../handlers/emailHandler.js";

const DLQ_ALERT_THRESHOLD = parseInt(env.DLQ_ALERT_THRESHOLD || '10');

export const getDlqEntries = async (options) => {
    const { rows } = await pool.query(
        `SELECT * FROM dead_letter_queue
        ${options.includeResolved ? '' : 'WHERE resolved = FALSE'}
        ORDER BY failed_at DESC
        LIMIT $1`,
        [options.limit]
    );

    return { statusCode: StatusCodes.OK, data: { success: true, count: rows.length, data: rows } };
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
    const { rows: [entry] } = await pool.query(
        `SELECT * FROM dead_letter_queue WHERE id = $1 FOR UPDATE`,
        [dlqId]
    );
    if (!entry) 
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: `DLQ entry ${dlqId} not found` } };
 
    // Reset the original job
    const { rows: [job] } = await pool.query(
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
    if (!job) 
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: `Original job ${entry.job_id} not found` } };
 
    // Stamp the DLQ entry
    await pool.query(
      `UPDATE dead_letter_queue
       SET retried_at = NOW(), retried_by = $1
       WHERE id = $2`,
      [retriedBy, dlqId]
    );
 
    await logEvent(pool, {
      jobId:   entry.job_id,
      event:   'job.retry',
      level:   'warn',
      message: `Manual retry triggered from DLQ by ${retriedBy}`,
      metadata: { dlq_id: dlqId, retried_by: retriedBy }
    });
 
    winston.info('DLQ manual retry triggered', { dlq_id: dlqId, job_id: entry.job_id, retried_by: retriedBy });

    return { statusCode: StatusCodes.OK, data: { status: 'success', message: 'Job retried successfully', job, dlqEntry: entry } };
}
 
// ─── CHECK DLQ ALERT THRESHOLD ───────────────────────────────────────────────
/**
 * Called by the worker every time a job is moved to DLQ.
 * If unresolved count crosses the threshold, fires a simulated alert.
 */
export const checkDlqThreshold = async () => {
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM dead_letter_queue WHERE resolved = FALSE`
  );
 
  if (count >= DLQ_ALERT_THRESHOLD) {
    // winston.error('DLQ ALERT: threshold exceeded — engineering action required', {
    //   unresolved_count: count,
    //   threshold:        DLQ_ALERT_THRESHOLD,
    //   alert_type:       'dlq_overflow',
    // });

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