import { apiUrl } from './config.js';
import { parseJsonResponse } from './http.js';

const INTERVAL_LABEL = {
  every_1_minute: '1m',
  every_5_minutes: '5m',
  every_1_hour: '1h',
};

const INTERVAL_TO_API = {
  '1m': 'every_1_minute',
  every_1_minute: 'every_1_minute',
  '5m': 'every_5_minutes',
  every_5_minutes: 'every_5_minutes',
  '1h': 'every_1_hour',
  every_1_hour: 'every_1_hour',
};

export function mapStatusFromApi(status) {
  if (status === 'processing') return 'running';
  return status;
}

function formatInterval(recurringInterval) {
  if (!recurringInterval) return '-';
  return INTERVAL_LABEL[recurringInterval] ?? recurringInterval;
}

export function mapJobFromApi(job) {
  return {
    id: job.id,
    type: job.type,
    priority: job.priority,
    status: mapStatusFromApi(job.status),
    retry_count: job.retry_count ?? 0,
    scheduled_time: job.scheduled_at,
    interval: formatInterval(job.recurring_interval),
    created_time: job.created_at,
    payload: job.payload ?? {},
  };
}

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

export async function fetchJobs() {
  const res = await fetch(apiUrl('/api/jobs'));
  const body = await parseJsonResponse(res);

  if (body.status !== 'success' || !Array.isArray(body.jobs)) {
    throw new Error('Unexpected jobs response');
  }

  return body.jobs.map(mapJobFromApi);
}

export async function fetchJobStats() {
  const res = await fetch(apiUrl('/api/jobs/stats'));
  const body = await parseJsonResponse(res);

  if (body.status !== 'success' || !body.stats) {
    throw new Error('Unexpected stats response');
  }

  return mapStatsFromApi(body.stats);
}

export async function createJob(jobInput) {
  const intervalKey = jobInput.interval?.trim();
  const recurring_interval = intervalKey && intervalKey !== '-'
    ? INTERVAL_TO_API[intervalKey]
    : undefined;

  const body = {
    type: jobInput.type,
    priority: Number(jobInput.priority),
    scheduled_at: new Date(jobInput.scheduled_time).toISOString(),
    payload: jobInput.payload ?? {},
  };

  if (recurring_interval) {
    body.recurring_interval = recurring_interval;
  }

  const res = await fetch(apiUrl('/api/jobs'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await parseJsonResponse(res);

  if (data.status !== 'success' || !data.job) {
    throw new Error('Unexpected create job response');
  }

  return mapJobFromApi(data.job);
}

/** Apply a SSE job.event payload onto an existing UI job row. */
export function applyJobEventUpdate(job, event) {
  if (job.id !== event.job_id) return job;

  return {
    ...job,
    status: mapStatusFromApi(event.status),
    retry_count: event.retry_count ?? job.retry_count,
    scheduled_time: event.retry_at ?? job.scheduled_time,
  };
}
