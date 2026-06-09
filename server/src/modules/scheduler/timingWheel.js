/**
 * TIMING WHEEL  — alternative scheduling algorithm (benchmarked against heap)
 *
 * A circular buffer of N slots, each = one tick (default 1 s).
 * Insert: O(1) — compute slot = (now + delay) % N, push into bucket.
 * Tick:   O(k) — drain the current slot (k = jobs in that slot, usually tiny).
 *
 * vs Heap:
 *   Heap         — O(log n) insert/pop, strict priority ordering
 *   Timing wheel — O(1)     insert/tick, no priority ordering
 *
 * Used here in parallel with the heap for benchmarking. The heap drives
 * actual dispatch; the wheel tracks scheduled_at independently.
 */
export class TimingWheel {
  #slots;
  #overflow = [];
  #current  = 0;
  #tickMs;
  #size;

  constructor(tickMs = 1000, size = 3600) {
    this.#tickMs = tickMs;
    this.#size   = size;
    this.#slots  = Array.from({ length: size }, () => []);
  }

  insert(job) {
    const now        = Date.now();
    const dueMs      = job.run_at ? new Date(job.run_at).getTime() : now;
    const delayTicks = Math.max(0, Math.ceil((dueMs - now) / this.#tickMs));

    if (delayTicks >= this.#size) {
      this.#overflow.push({ job, dueMs });
      return -1;
    }

    const slot = (this.#current + delayTicks) % this.#size;
    this.#slots[slot].push(job);
    return slot;
  }

  tick() {
    this.#current = (this.#current + 1) % this.#size;
    const due     = this.#slots[this.#current];
    this.#slots[this.#current] = [];

    const horizon   = Date.now() + this.#size * this.#tickMs;
    const stillOver = [];
    for (const entry of this.#overflow) {
      if (entry.dueMs <= horizon) this.insert(entry.job);
      else stillOver.push(entry);
    }
    this.#overflow = stillOver;

    return due;
  }

  stats() {
    return {
      wheelSize:    this.#size,
      filledSlots:  this.#slots.filter(s => s.length > 0).length,
      overflowJobs: this.#overflow.length,
      currentSlot:  this.#current,
    };
  }
}