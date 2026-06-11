import winston from 'winston';
import { sendEmail } from '../handlers/emailHandler.js';
import { logEvent } from '../jobs/jobs.service.js';
import { checkDlqThreshold, resolveDlqForJob } from '../dlq/dlq.service.js';
import pool from '../../config/database.js';
import { publishJobEvent } from '../../utils/jobEvents.js';

const DEFAULT_HANDLERS = {
  send_email: sendEmail,
};

export const INTERVAL_MS = {
  every_1_minute:  60_000,
  every_5_minutes: 300_000,
  every_1_hour:    3_600_000,
};

export const backoffMs = (attempt, random = Math.random()) =>
  Math.round(Math.pow(5, attempt - 1) * 1000 + random * 500);

export function createWorker(deps = {}) {
  const handlers = deps.handlers ?? DEFAULT_HANDLERS;
  const db = deps.pool ?? pool;
  const publish = deps.publishJobEvent ?? publishJobEvent;
  const log = deps.logEvent ?? logEvent;
  const resolveDlq = deps.resolveDlqForJob ?? resolveDlqForJob;
  const checkThreshold = deps.checkDlqThreshold ?? checkDlqThreshold;
  const backoff = deps.backoffMs ?? backoffMs;

  async function scheduleNextRun(client, job) {
    const ms = INTERVAL_MS[job.recurring_interval];
    if (!ms) return;

    const next = new Date(Date.now() + ms).toISOString();
    await client.query(
      `INSERT INTO jobs
         (type, payload, priority, effective_priority,
          scheduled_at, run_at, recurring_interval, max_retries)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [job.type, job.payload, job.priority, job.priority, next, next, job.recurring_interval, job.max_retries]
    );
    winston.info('Recurring job re-scheduled', { original: job.id, next_run: next });
  }

  async function persistLog(entry) {
    const logClient = await db.connect();
    try {
      await logClient.query('BEGIN');
      await log(logClient, entry);
      await logClient.query('COMMIT');
    } catch (err) {
      await logClient.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      logClient.release();
    }
  }

  async function claimJob(jobId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT * FROM jobs
         WHERE  id     = $1
           AND  status = 'pending'
         FOR UPDATE SKIP LOCKED`,
        [jobId]
      );

      if (!rows.length) {
        await client.query('ROLLBACK');
        winston.debug('Job skipped: locked or no longer pending', { job_id: jobId });
        return null;
      }

      const locked = rows[0];

      const { rows: deps } = await client.query(
        `SELECT j.id, j.status
         FROM   job_dependencies d
         JOIN   jobs j ON j.id = d.depends_on
         WHERE  d.job_id = $1`,
        [locked.id]
      );

      const unmet = deps.filter(d => d.status !== 'completed');
      if (unmet.length) {
        await client.query('ROLLBACK');

        const waitingOn = unmet.map(d => d.id);
        await persistLog({
          jobId:    locked.id,
          event:    'job.held',
          level:    'info',
          message:  `Job held: ${unmet.length} dependenc${unmet.length === 1 ? 'y' : 'ies'} unmet`,
          metadata: { waiting_on: waitingOn },
        }).catch((err) => {
          winston.warn('Failed to log dependency hold', { job_id: locked.id, error: err.message });
        });

        winston.info('Job held: dependencies unmet', {
          job_id: locked.id,
          waiting_on: waitingOn,
        });
        return null;
      }

      await client.query(
        `UPDATE jobs
         SET    status     = 'processing',
                locked_at  = NOW(),
                started_at = NOW()
         WHERE  id = $1`,
        [locked.id]
      );

      await log(client, {
        jobId:    locked.id,
        event:    'job.started',
        level:    'info',
        message:  `Worker started ${locked.type}`,
        metadata: { retry_count: locked.retry_count },
      });

      await client.query('COMMIT');
      return locked;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // Let in-flight handlers finish; if the job was cancelled while running, keep
  // cancelled — discard the result, skip recurring, and do not resolve DLQ.
  async function recordSuccess(locked, result) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: [current] } = await client.query(
        `SELECT status FROM jobs WHERE id = $1 FOR UPDATE`,
        [locked.id]
      );

      if (current?.status === 'cancelled') {
        await log(client, {
          jobId:    locked.id,
          event:    'job.cancelled',
          level:    'info',
          message:  'Handler finished after cancellation; result discarded',
          metadata: { result_discarded: true },
        });

        await client.query('COMMIT');
        publish({ status: 'cancelled', job_id: locked.id, type: locked.type }).catch(() => {});
        winston.info('Job remains cancelled after handler finished', {
          job_id: locked.id,
          type:   locked.type,
        });
        return;
      }

      await client.query(
        `UPDATE jobs
         SET    status        = 'completed',
                completed_at  = NOW(),
                error_message = NULL
         WHERE  id = $1`,
        [locked.id]
      );

      await log(client, {
        jobId:    locked.id,
        event:    'job.completed',
        level:    'info',
        message:  'Job completed successfully',
        metadata: { result },
      });

      if (locked.recurring_interval) await scheduleNextRun(client, locked);

      await resolveDlq(client, locked.id);

      await client.query('COMMIT');
      publish({ status: 'completed', job_id: locked.id, type: locked.type }).catch(() => {});
      winston.info('Job completed', { job_id: locked.id, type: locked.type });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function recordFailure(job, err) {
    const newCount = (job.retry_count ?? 0) + 1;
    winston.warn('Job failed', { job_id: job.id, attempt: newCount, error: err.message });

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: [current] } = await client.query(
        `SELECT status FROM jobs WHERE id = $1 FOR UPDATE`,
        [job.id]
      );

      if (current?.status === 'cancelled') {
        await log(client, {
          jobId:    job.id,
          event:    'job.cancelled',
          level:    'info',
          message:  'Handler failed after cancellation; not retrying',
          metadata: { error: err.message },
        });

        await client.query('COMMIT');
        return;
      }

      // max_retries = max automatic retries (default 3); DLQ when newCount > max_retries
      console.log(newCount, job.max_retries);
      if (newCount > job.max_retries) {
        console.log('max retries reached', newCount, job.max_retries);
        await client.query(
          `INSERT INTO dead_letter_queue (job_id, job_snapshot, failure_reason)
           VALUES ($1, $2, $3)`,
          [job.id, job, err.message]
        );

        await client.query(
          `UPDATE jobs
           SET    status = 'failed', error_message = $1, retry_count = $2
           WHERE  id = $3`,
          [err.message, newCount, job.id]
        );

        await log(client, {
          jobId:    job.id,
          event:    'job.failed',
          level:    'error',
          message:  `Exhausted ${job.max_retries} retries. Sent to DLQ.`,
          metadata: { error: err.message, retry_count: newCount },
        });

        await client.query('COMMIT');
        publish({ status: 'failed', job_id: job.id, type: job.type }).catch(() => {});
        winston.warn('Job sent to DLQ', { job_id: job.id, type: job.type });
        await checkThreshold();
      } else {
        const delay   = backoff(newCount);
        const retryAt = new Date(Date.now() + delay).toISOString();

        await client.query(
          `UPDATE jobs
           SET    status        = 'pending',
                  retry_count   = $1,
                  run_at        = $2,
                  error_message = $3,
                  locked_at     = NULL,
                  started_at    = NULL
           WHERE  id = $4`,
          [newCount, retryAt, err.message, job.id]
        );

        await log(client, {
          jobId:    job.id,
          event:    'job.retry',
          level:    'warn',
          message:  `Attempt ${newCount} failed. Retrying at ${retryAt}.`,
          metadata: { error: err.message, delay_ms: delay, retry_count: newCount },
        });

        await client.query('COMMIT');
        publish({ status: 'pending', job_id: job.id, type: job.type, retry_count: newCount, retry_at: retryAt }).catch(() => {});
        winston.info('Job retry scheduled', { job_id: job.id, attempt: newCount, retry_at: retryAt, delay_ms: delay });
      }
    } catch (inner) {
      await client.query('ROLLBACK').catch(() => {});
      winston.error('Failed to record job failure', { job_id: job.id, error: inner.message });
    } finally {
      client.release();
    }
  }

  async function processJob(job) {
    const locked = await claimJob(job.id);
    if (!locked) return;

    publish({ status: 'processing', job_id: locked.id, type: locked.type }).catch(() => {});

    try {
      const handler = handlers[locked.type];
      if (!handler) throw new Error(`No handler registered for type: "${locked.type}"`);

      const result = await handler(locked);
      await recordSuccess(locked, result);
    } catch (err) {
      await recordFailure(job, err);
    }
  }

  return {
    claimJob,
    recordSuccess,
    recordFailure,
    processJob,
    scheduleNextRun,
  };
}

export const defaultWorker = createWorker();
