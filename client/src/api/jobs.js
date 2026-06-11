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
  //if (status === 'processing') return 'processing';
  return status;
}

function formatInterval(recurringInterval) {
  if (!recurringInterval) return '-';
  return INTERVAL_LABEL[recurringInterval] ?? recurringInterval;
}

function normalizeDependencies(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((dep) => {
    if (typeof dep === 'string') return { id: dep, name: '' };
    return { id: dep.id, name: dep.name ?? '' };
  });
}

export function mapJobFromApi(job) {
  return {
    id: job.id,
    name: job.name ?? '',
    type: job.type,
    priority: job.priority,
    status: mapStatusFromApi(job.status),
    retry_count: job.retry_count ?? 0,
    scheduled_time: job.scheduled_at,
    interval: formatInterval(job.recurring_interval),
    created_time: job.created_at,
    payload: job.payload ?? {},
    dependencies: normalizeDependencies(job.dependencies),
  };
}

/** Client-side filter for offline/demo job lists. */
export function filterJobs(jobs, search) {
  const q = search.trim().toLowerCase();
  if (!q) return jobs;

  return jobs.filter((job) => {
    const depText = (job.dependencies ?? [])
      .map((dep) => `${dep.name} ${dep.id}`.trim())
      .join(' ');

    return (
      (job.name || '').toLowerCase().includes(q)
      || job.type.toLowerCase().includes(q)
      || job.status.toLowerCase().includes(q)
      || String(job.id).toLowerCase().includes(q)
      || depText.toLowerCase().includes(q)
    );
  });
}

export function formatDependencyLabels(dependencies, nameById = new Map()) {
  if (!dependencies?.length) return '—';

  return dependencies
    .map((dep) => dep.name || nameById.get(dep.id) || dep.id)
    .join(', ');
}

/** Map backend stat keys to the dashboard display model. */
export function mapStatsFromApi(apiStats) {
  const counts = {
    pending: apiStats.pending ?? 0,
    processing: apiStats.processing ?? 0,
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

const DEFAULT_JOBS_PAGE_SIZE = 20;

export async function fetchJobs({ page = 1, limit = DEFAULT_JOBS_PAGE_SIZE, status, search } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (status) params.set('status', status);
  if (search?.trim()) params.set('search', search.trim());

  const res = await fetch(apiUrl(`/api/jobs?${params}`));
  const body = await parseJsonResponse(res);

  if (body.status !== 'success' || !Array.isArray(body.data)) {
    throw new Error('Unexpected jobs response');
  }

  return {
    page: body.page,
    limit: body.limit,
    total: body.total,
    total_jobs: body.total_jobs,
    links: body.links ?? {},
    jobs: body.data.map(mapJobFromApi),
  };
}

export { DEFAULT_JOBS_PAGE_SIZE };

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
    name: jobInput.name?.trim(),
    type: jobInput.type,
    priority: Number(jobInput.priority),
    scheduled_at: new Date(jobInput.scheduled_time).toISOString(),
    payload: jobInput.payload ?? {},
  };

  if (recurring_interval) {
    body.recurring_interval = recurring_interval;
  }

  if (Array.isArray(jobInput.dependencies) && jobInput.dependencies.length > 0) {
    body.dependencies = jobInput.dependencies;
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

export async function cancelJob(id) {
  const res = await fetch(apiUrl(`/api/jobs/${id}/cancel`), {
    method: 'PATCH',
  });

  const data = await parseJsonResponse(res);

  if (data.status !== 'success' || !data.job) {
    throw new Error(data.message || 'Failed to cancel job');
  }

  return mapJobFromApi(data.job);
}

function sameJobId(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/** Apply a SSE job.event payload onto an existing UI job row. */
export function applyJobEventUpdate(job, event) {
  if (!sameJobId(job.id, event.job_id)) return job;

  return {
    ...job,
    status: mapStatusFromApi(event.status),
    retry_count: event.retry_count ?? job.retry_count,
    scheduled_time: event.retry_at ?? job.scheduled_time,
  };
}
