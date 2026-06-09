/**
 * MIN-HEAP PRIORITY QUEUE
 *
 * Ordering (mirrors spec + your idx_jobs_worker_poll index):
 *   1. effective_priority ASC  — 1=high beats 2=medium beats 3=low
 *   2. run_at ASC              — earlier scheduled time goes first
 *   3. created_at ASC          — older job wins the tie
 *
 * push / pop — O(log n)
 * peek       — O(1)
 * boostStarved — O(n) using Floyd's in-place heapify
 */
export class MinHeap {
  #h = [];

  get size() { return this.#h.length; }
  peek()     { return this.#h[0] ?? null; }
  toArray()  { return [...this.#h]; }

  push(job) {
    if (job.effective_priority == null) job.effective_priority = Number(job.priority);
    this.#h.push(job);
    this.#up(this.#h.length - 1);
  }

  pop() {
    if (!this.#h.length) return null;
    const top  = this.#h[0];
    const last = this.#h.pop();
    if (this.#h.length) { this.#h[0] = last; this.#down(0); }
    return top;
  }

  /**
   * Starvation prevention — called by the scheduler every 30s.
   * Any job waiting longer than thresholdMs gets its effective_priority
   * bumped up by one level (3→2 or 2→1). Heap is re-ordered in place.
   */
  boostStarved(thresholdMs) {
    const now     = Date.now();
    let   changed = false;
    for (const job of this.#h) {
      if (job.effective_priority > 1 && now - new Date(job.created_at).getTime() > thresholdMs) {
        job.effective_priority -= 1;
        changed = true;
      }
    }
    if (changed) {
      // re-heap
      for (let i = (this.#h.length >> 1) - 1; i >= 0; i--) this.#down(i);
    }
    return changed;
  }

  #before(a, b) {
    if (a.effective_priority !== b.effective_priority) return a.effective_priority < b.effective_priority;
    const at = a.run_at ? new Date(a.run_at).getTime() : 0;
    const bt = b.run_at ? new Date(b.run_at).getTime() : 0;
    if (at !== bt) return at < bt;
    return new Date(a.created_at) < new Date(b.created_at);
  }

  #up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.#before(this.#h[i], this.#h[p])) break;
      [this.#h[i], this.#h[p]] = [this.#h[p], this.#h[i]];
      i = p;
    }
  }

  #down(i) {
    const n = this.#h.length;
    while (true) {
      let t = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < n && this.#before(this.#h[l], this.#h[t])) t = l;
      if (r < n && this.#before(this.#h[r], this.#h[t])) t = r;
      if (t === i) break;
      [this.#h[i], this.#h[t]] = [this.#h[t], this.#h[i]];
      i = t;
    }
  }
}