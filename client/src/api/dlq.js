import { apiUrl } from './config.js';
import { parseJsonResponse } from './http.js';

export function mapDlqFromApi(entry) {
  const snap = entry.job_snapshot ?? {};

  return {
    id: entry.id,
    job_id: entry.job_id,
    type: snap.type ?? 'unknown',
    priority: snap.priority ?? 2,
    retry_count: snap.retry_count ?? 0,
    failed_at: entry.failed_at,
    error: entry.failure_reason,
    payload: snap.payload ?? {},
  };
}

export async function fetchDlqEntries() {
  const res = await fetch(apiUrl('/api/dlq'));
  const body = await parseJsonResponse(res);

  if (!body.success || !Array.isArray(body.data)) {
    throw new Error('Unexpected DLQ response');
  }

  return body.data.map(mapDlqFromApi);
}

export async function retryDlqEntry(id) {
  const res = await fetch(apiUrl(`/api/dlq/${id}/retry`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retried_by: 'ui' }),
  });

  const body = await parseJsonResponse(res);

  if (body.status !== 'success' || !body.job) {
    throw new Error('Unexpected DLQ retry response');
  }

  return body;
}
