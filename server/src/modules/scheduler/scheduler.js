import winston  from 'winston';
import { MinHeap }     from './heap.js';
import { TimingWheel } from './timingWheel.js';
import pool from '../../config/database.js';
import env from '../../config/env.js';
import { logEvent } from '../jobs/jobs.service.js';

const POLL_MS       = parseInt(env.WORKER_POLL_INTERVAL_MS      || '2000');
const STARVATION_MS = parseInt(env.STARVATION_THRESHOLD_MINUTES || '5') * 60_000;

class Scheduler {
  #heap    = new MinHeap();
  #wheel   = new TimingWheel();
  #inHeap  = new Set();
  #timers  = [];

  start() {
    this.#load();
    this.#timers = [
      setInterval(() => this.#load(),           POLL_MS),
      setInterval(() => this.#boostStarved(),   30_000),
      setInterval(() => this.#wheel.tick(),      1_000),
    ];
    winston.info('Scheduler started', { poll_ms: POLL_MS, starvation_ms: STARVATION_MS });
  }

  stop() {
    this.#timers.forEach(clearInterval);
    this.#timers = [];
    winston.info('Scheduler stopped');
  }

  /** Worker calls this to get the next job, or null if heap is empty. */
  next() {
    const job = this.#heap.pop();
    if (job) this.#inHeap.delete(job.id);
    return job;
  }

  heapSize()   { return this.#heap.size; }
  wheelStats() { return this.#wheel.stats(); }

  async #load() {
    try {
      // Fetch pending jobs whose run_at has arrived.
      const { rows } = await pool.query(`
        SELECT *
        FROM   jobs
        WHERE  status = 'pending'
          AND  run_at <= NOW()
        ORDER  BY effective_priority ASC, run_at ASC, created_at ASC
        LIMIT  100
      `);

      for (const job of rows) {
        if (this.#inHeap.has(job.id)) continue;
        this.#heap.push(job);
        this.#wheel.insert(job);
        this.#inHeap.add(job.id);
      }
    } catch (err) {
      winston.error('Scheduler load error', { error: err.message });
    }
  }

  async #boostStarved() {
    const client = await pool.connect();
    const thresholdMin = STARVATION_MS / 60_000;

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(`
        UPDATE jobs
        SET    effective_priority = GREATEST(1, effective_priority - 1)
        WHERE  status             = 'pending'
          AND  effective_priority > 1
          AND  created_at        <= NOW() - ($1 || ' milliseconds')::INTERVAL
        RETURNING id, effective_priority, priority
      `, [STARVATION_MS]);

      for (const row of rows) {
        const newPriority = Number(row.effective_priority);
        const previousPriority = newPriority + 1;

        await logEvent(client, {
          jobId:   row.id,
          event:   'job.priority_boosted',
          level:   'info',
          message: `Starvation boost: effective_priority ${previousPriority} → ${newPriority} (waited ≥ ${thresholdMin} min)`,
          metadata: {
            previous_effective_priority: previousPriority,
            effective_priority: newPriority,
            base_priority: row.priority,
            threshold_minutes: thresholdMin,
          },
        });
      }

      await client.query('COMMIT');

      // Mirror the boost in memory immediately
      const changed = this.#heap.boostStarved(STARVATION_MS);

      if (rows.length > 0 || changed)
        winston.info('Starvation boost', { db_rows: rows.length, in_heap: changed });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      winston.error('Starvation boost error', { error: err.message });
    } finally {
      client.release();
    }
  }
}

export default new Scheduler();