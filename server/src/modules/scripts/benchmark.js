import { writeFileSync, mkdirSync } from 'fs';
import { MinHeap }     from '../scheduler/heap.js';
import { TimingWheel } from '../scheduler/timingWheel.js';

const SIZES = [1_000, 10_000, 100_000];

// JOB FACTORY
// Generates a realistic job object matching the exact shape the scheduler uses.
// Priorities and run_at values are randomised so neither algorithm gets
// an artificially easy input.

function makeJob(i) {
  const priority  = (i % 3) + 1;                          // cycles 1, 2, 3
  const offsetMs  = Math.floor(Math.random() * 3600_000); // 0–60 min from now
  const run_at    = new Date(Date.now() + offsetMs).toISOString();
  const created_at = new Date(Date.now() - Math.floor(Math.random() * 60_000)).toISOString();

  return {
    id:                 `job-${i}`,
    type:               'send_email',
    priority,
    effective_priority: priority,
    run_at,
    created_at,
    payload:            { to: `user${i}@example.com`, subject: 'Test' },
  };
}

// TIMER 

function measure(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// HEAP BENCHMARK

function benchmarkHeap(jobs) {
  const heap = new MinHeap();

  const insertMs = measure(() => {
    for (const job of jobs) heap.push(job);
  });

  const popMs = measure(() => {
    while (heap.size > 0) heap.pop();
  });

  return { insertMs, popMs };
}

// TIMING WHEEL BENCHMARK

function benchmarkWheel(jobs) {
  const wheel = new TimingWheel(1000, 3600);

  const insertMs = measure(() => {
    for (const job of jobs) wheel.insert(job);
  });

  // Drain by ticking until all slots are empty
  const tickMs = measure(() => {
    for (let i = 0; i < 3600; i++) wheel.tick();
  });

  return { insertMs, tickMs };
}

// FORMAT HELPERS 

const fmt   = (ms)  => ms.toFixed(3).padStart(10);
const fmtOp = (ms, n) => (ms / n * 1000).toFixed(3).padStart(12); // µs per op

// RUN

const results = [];

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  BENCHMARK — Min-Heap  vs  Timing Wheel');
console.log('═══════════════════════════════════════════════════════════════════\n');

for (const n of SIZES) {
  // Build the dataset once and reuse it for both algorithms
  // so they receive identical input
  const jobs = Array.from({ length: n }, (_, i) => makeJob(i));

  const heap  = benchmarkHeap([...jobs]);   // spread so each gets its own copy
  const wheel = benchmarkWheel([...jobs]);

  const row = {
    n,
    heap_insert_ms:      heap.insertMs,
    heap_pop_ms:         heap.popMs,
    heap_insert_us_per:  heap.insertMs / n * 1000,
    heap_pop_us_per:     heap.popMs    / n * 1000,
    wheel_insert_ms:     wheel.insertMs,
    wheel_tick_ms:       wheel.tickMs,
    wheel_insert_us_per: wheel.insertMs / n * 1000,
    wheel_tick_us_per:   wheel.tickMs   / 3600 * 1000,
  };

  results.push(row);

  console.log(`  ── n = ${n.toLocaleString().padStart(7)} ─────────────────────────────────────────`);
  console.log(`                         Total (ms)     Per op (µs)`);
  console.log(`  Heap     insert    ${fmt(heap.insertMs)}   ${fmtOp(heap.insertMs, n)}`);
  console.log(`  Heap     pop all   ${fmt(heap.popMs)}   ${fmtOp(heap.popMs, n)}`);
  console.log(`  Wheel    insert    ${fmt(wheel.insertMs)}   ${fmtOp(wheel.insertMs, n)}`);
  console.log(`  Wheel    tick×3600 ${fmt(wheel.tickMs)}   ${fmtOp(wheel.tickMs, 3600)} (per tick)`);
  console.log();
}

// ─── SUMMARY TABLE ───────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  SUMMARY — Insert speed winner per dataset size');
console.log('═══════════════════════════════════════════════════════════════════\n');
console.log('  n            Heap insert    Wheel insert   Winner');
console.log('  ─────────────────────────────────────────────────────');

for (const r of results) {
  const heapStr  = `${r.heap_insert_ms.toFixed(2)} ms`.padEnd(15);
  const wheelStr = `${r.wheel_insert_ms.toFixed(2)} ms`.padEnd(15);
  const winner   = r.wheel_insert_ms < r.heap_insert_ms ? 'Timing Wheel ✓' : 'Heap ✓';
  console.log(`  ${String(r.n.toLocaleString()).padEnd(13)}${heapStr}${wheelStr}${winner}`);
}

// TRADEOFFS 

console.log(`
  TRADEOFFS
  Heap
    + Strict priority ordering — high-priority jobs always run first
    + Works naturally for any time range, no pre-allocated memory
    - O(log n) insert and pop — slows as queue depth grows
    - Re-heapify needed after starvation boost — O(n)

  Timing Wheel
    + O(1) insert — slot index is a single modulo operation
    + O(1) advance — each tick drains one slot regardless of queue depth
    - No priority ordering — all jobs in a slot are equal
    - Fixed memory footprint (3 600 slots) even when mostly empty
    - Jobs scheduled beyond the wheel horizon go to overflow

  This project uses BOTH:
    The heap drives actual job dispatch (priority matters).
    The timing wheel tracks scheduled_at for time-based firing.
`);

// SAVE JSON 

mkdirSync('logs', { recursive: true });
const outPath = 'logs/benchmark.json';
writeFileSync(outPath, JSON.stringify({ ran_at: new Date().toISOString(), results }, null, 2));
console.log(`  Results saved to ${outPath}\n`);