import { apiUrl } from './config.js';
import { parseJsonResponse } from './http.js';

export const DEFAULT_LOGS_PAGE_SIZE = 20;

export function mapLogFromApi(log) {
  return {
    id: log.id,
    job_id: log.job_id,
    event: log.event,
    level: log.level,
    message: log.message,
    metadata: log.metadata ?? {},
    created_at: log.created_at,
  };
}

function parseLogsResponse(body) {
  if (body.status !== 'success' || !Array.isArray(body.data)) {
    throw new Error('Unexpected job logs response');
  }

  return {
    logs: body.data.map(mapLogFromApi),
    page: body.page,
    limit: body.limit,
    total: body.total,
    total_logs: body.total_logs,
    links: body.links ?? {},
  };
}

export async function fetchJobLogs(jobId, {
  page = 1,
  limit = DEFAULT_LOGS_PAGE_SIZE,
  event,
  level,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (event && event !== 'all') params.set('event', event);
  if (level && level !== 'all') params.set('level', level);

  const id = jobId === 'all' ? 'all' : jobId;
  const res = await fetch(apiUrl(`/api/jobs/${id}/logs?${params}`));
  const body = await parseJsonResponse(res);
  return parseLogsResponse(body);
}
