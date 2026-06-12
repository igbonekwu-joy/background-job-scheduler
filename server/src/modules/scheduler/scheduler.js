import winston  from 'winston';
import { MinHeap }     from './heap.js';
import { TimingWheel } from './timingWheel.js';
import pool from '../../config/database.js';
import env from '../../config/env.js';

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
    try {
      // Update Postgres — source of truth
      const { rowCount } = await pool.query(`
        UPDATE jobs
        SET    effective_priority = GREATEST(1, effective_priority - 1)
        WHERE  status             = 'pending'
          AND  effective_priority > 1
          AND  created_at        <= NOW() - ($1 || ' milliseconds')::INTERVAL
      `, [STARVATION_MS]);

      // Mirror the boost in the in-memory heap immediately
      const changed = this.#heap.boostStarved(STARVATION_MS);

      if (rowCount > 0 || changed)
        winston.info('Starvation boost', { db_rows: rowCount, in_heap: changed });
    } catch (err) {
      winston.error('Starvation boost error', { error: err.message });
    }
  }
}

export default new Scheduler();