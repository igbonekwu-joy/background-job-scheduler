/**
 * MIN-HEAP PRIORITY QUEUE
 * Ordering
 *   1. effective_priority ASC  => 1=high beats 2=medium beats 3=low
 *   2. run_at ASC              => earlier scheduled time goes first
 *   3. created_at ASC          => older job wins the tie
 
 */
export class MinHeap {
  #heap = [];

  get size() { return this.#heap.length; }
  // peek()     { return this.#heap[0] ?? null; }
  // toArray()  { return [...this.#heap]; }

  push(job) {
    if (job.effective_priority == null) job.effective_priority = Number(job.priority);
    this.#heap.push(job);
    this.#up(this.#heap.length - 1);
  }

  pop() {
    if (!this.#heap.length) return null;
    const top  = this.#heap[0];
    const last = this.#heap.pop();
    if (this.#heap.length) { this.#heap[0] = last; this.#down(0); }
    return top;
  }

  // Starvation prevention called by the scheduler every 30s.
  boostStarved(thresholdMs) {
    const now     = Date.now();
    let   changed = false;
    for (const job of this.#heap) {
      if (job.effective_priority > 1 && now - new Date(job.created_at).getTime() > thresholdMs) {
        job.effective_priority -= 1;
        changed = true;
      }
    }
    if (changed) {
      // re-heap
      for (let i = (this.#heap.length >> 1) - 1; i >= 0; i--) this.#down(i);
    }
    return changed;
  }

  // comparator
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
      if (!this.#before(this.#heap[i], this.#heap[p])) break;
      [this.#heap[i], this.#heap[p]] = [this.#heap[p], this.#heap[i]];
      i = p;
    }
  }

  #down(i) {
    const n = this.#heap.length;
    while (true) {
      let target = i;
      const left = 2*i+1, right = 2*i+2;
      if (left < n && this.#before(this.#heap[left], this.#heap[target])) target = left;
      if (right < n && this.#before(this.#heap[right], this.#heap[target])) target = right;
      if (target === i) break;
      [this.#heap[i], this.#heap[target]] = [this.#heap[target], this.#heap[i]];
      i = target;
    }
  }
}