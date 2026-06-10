import 'dotenv/config';
import winston   from 'winston';
import scheduler from '../scheduler/scheduler.js';
import { sendEmail } from '../handlers/emailHandler.js';
import { logEvent  } from '../jobs/jobs.service.js';
import { checkDlqThreshold } from '../dlq/dlq.service.js';
import pool from '../../config/database.js';
import logger from '../../config/logger.js';
import { publishJobEvent } from '../../utils/jobEvents.js';

logger();

// ─── HANDLER REGISTRY 
const HANDLERS = {
  send_email: sendEmail,
};

// ─── BACKOFF 
// attempt 1 → ~1s | attempt 2 → ~5s | attempt 3 → ~25s
const backoffMs = (attempt) =>
  Math.round(Math.pow(5, attempt - 1) * 1000 + Math.random() * 500);

// ─── RECURRING 
const INTERVAL_MS = {
  every_1_minute:  60_000,
  every_5_minutes: 300_000,
  every_1_hour:    3_600_000,
};

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

// ─── PROCESS ONE JOB 
async function processJob(job) {
  try {
    // ── 1. Lock with SELECT FOR UPDATE SKIP LOCKED 
    // Re-reads the row inside the transaction. SKIP LOCKED means if another
    // worker already holds it, we get zero rows and bail — no blocking.
    const { rows } = await pool.query(
      `SELECT * FROM jobs
       WHERE  id     = $1
         AND  status = 'pending'
       FOR UPDATE SKIP LOCKED`,
      [job.id]
    );

    if (!rows.length) {
      // Either cancelled since entering the heap, or grabbed by another worker.
      await pool.query('ROLLBACK');
      winston.debug('Job skipped: locked or no longer pending', { job_id: job.id });
      return;
    }

    const locked = rows[0];

    // ── 2. DAG check — all dependencies must be completed ────────────────────
    const { rows: deps } = await pool.query(
      `SELECT j.id, j.status
       FROM   job_dependencies d
       JOIN   jobs j ON j.id = d.depends_on
       WHERE  d.job_id = $1`,
      [locked.id]
    );

    const unmet = deps.filter(d => d.status !== 'completed');
    if (unmet.length) {
      // Release lock, leave as pending. Scheduler will re-load it next cycle.
      await pool.query('ROLLBACK');
      winston.debug('Job held: dependencies unmet', {
        job_id: locked.id,
        waiting_on: unmet.map(d => d.id),
      });
      return;
    }

    // ── 3. Claim it 
    await pool.query(
      `UPDATE jobs
       SET    status     = 'processing',
              locked_at  = NOW(),
              started_at = NOW()
       WHERE  id = $1`,
      [locked.id]
    );

    await logEvent(pool, {
      jobId:    locked.id,
      event:    'job.started',
      level:    'info',
      message:  `Worker started ${locked.type}`,
      metadata: { retry_count: locked.retry_count },
    });

    publishJobEvent({ status: 'processing', job_id: locked.id, type: locked.type }).catch(() => {});

    // ── 4. Run handler (outside transaction — handlers can be slow) ───────────
    const handler = HANDLERS[locked.type];
    if (!handler) throw new Error(`No handler registered for type: "${locked.type}"`);

    const result = await handler(locked);

    // ── 5a. Success
    try {
      await pool.query(
        `UPDATE jobs
         SET    status        = 'completed',
                completed_at  = NOW(),
                error_message = NULL
         WHERE  id = $1`,
        [locked.id]
      );

      await logEvent(pool, {
        jobId:    locked.id,
        event:    'job.completed',
        level:    'info',
        message:  'Job completed successfully',
        metadata: { result },
      });

      if (locked.recurring_interval) await scheduleNextRun(pool, locked);

      publishJobEvent({ status: 'completed', job_id: locked.id, type: locked.type }).catch(() => {});
      winston.info('Job completed', { job_id: locked.id, type: locked.type });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    } 

  } catch (err) {

    // ── 5b. Failure
    await pool.query('ROLLBACK').catch(() => {});

    try {
      const newCount = (job.retry_count ?? 0) + 1;
      winston.warn('Job failed', { job_id: job.id, attempt: newCount, error: err.message });

      if (newCount >= job.max_retries) {
        // ── Exhausted → DLQ
        await pool.query(
          `INSERT INTO dead_letter_queue (job_id, job_snapshot, failure_reason)
           VALUES ($1, $2, $3)`,
          [job.id, job, err.message]
        );

        await pool.query(
          `UPDATE jobs SET status = 'failed', error_message = $1 WHERE id = $2`,
          [err.message, job.id]
        );

        await logEvent(pool, {
          jobId:    job.id,
          event:    'job.failed',
          level:    'error',
          message:  `Exhausted ${job.max_retries} retries. Sent to DLQ.`,
          metadata: { error: err.message, retry_count: newCount },
        });

        publishJobEvent({ status: 'failed', job_id: job.id, type: job.type }).catch(() => {});
        winston.warn('Job sent to DLQ', { job_id: job.id, type: job.type });

        // Check alert threshold (reads DB, no transaction needed)
        await checkDlqThreshold();

      } else {
        // ── Schedule retry with backoff 
        const delay   = backoffMs(newCount);
        const retryAt = new Date(Date.now() + delay).toISOString();

        await pool.query(
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

        await logEvent(pool, {
          jobId:    job.id,
          event:    'job.retry',
          level:    'warn',
          message:  `Attempt ${newCount} failed. Retrying at ${retryAt}.`,
          metadata: { error: err.message, delay_ms: delay, retry_count: newCount },
        });

        publishJobEvent({ status: 'pending', job_id: job.id, type: job.type, retry_count: newCount, retry_at: retryAt }).catch(() => {});
        winston.info('Job retry scheduled', { job_id: job.id, attempt: newCount, retry_at: retryAt, delay_ms: delay });
      }

    } catch (inner) {
      await pool.query('ROLLBACK').catch(() => {});
      winston.error('Failed to record job failure', { job_id: job.id, error: inner.message });
    }

  }
}

// ─── POLL LOOP
function poll() {
  const job = scheduler.next(); // remove from heap

  if (job) {
    processJob(job).catch(err =>
      winston.error('Unhandled processJob error', { job_id: job.id, error: err.message })
    );
  }

  // Faster when there's work, backs off when idle
  setTimeout(poll, job ? 100 : 500);
}

// ─── START ────────────────────────────────────────────────────────────────────
scheduler.start(); // gets pending jobs, add to heap and wheel, boost starved (every 30s)
poll();
winston.info('Worker started');