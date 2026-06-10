import { apiUrl } from './config.js';

/** Map backend stat keys to the dashboard display model. */
export function mapStatsFromApi(apiStats) {
  const counts = {
    pending: apiStats.pending ?? 0,
    running: apiStats.processing ?? 0,
    completed: apiStats.completed ?? 0,
    failed: apiStats.failed ?? 0,
    dead: apiStats.dlq_unresolved ?? 0,
  };

  const totalJobs =
    (apiStats.pending ?? 0) +
    (apiStats.processing ?? 0) +
    (apiStats.completed ?? 0) +
    (apiStats.failed ?? 0) +
    (apiStats.cancelled ?? 0);

  return { counts, totalJobs };
}

export async function fetchJobStats() {
  const res = await fetch(apiUrl('/jobs/stats'));

  if (!res.ok) {
    throw new Error(`Stats request failed (${res.status})`);
  }

  const body = await res.json();

  if (body.status !== 'success' || !body.stats) {
    throw new Error('Unexpected stats response');
  }

  return mapStatsFromApi(body.stats);
}
