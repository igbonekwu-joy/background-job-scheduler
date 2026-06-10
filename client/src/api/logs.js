import { apiUrl } from './config.js';
import { parseJsonResponse } from './http.js';

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

export async function fetchJobLogs(jobId, { limit = 200 } = {}) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/logs?limit=${limit}`));
  const body = await parseJsonResponse(res);

  if (body.status !== 'success' || !Array.isArray(body.logs)) {
    throw new Error('Unexpected job logs response');
  }

  return body.logs.map(mapLogFromApi);
}

/** Fetch and merge logs for multiple jobs, newest first. */
export async function fetchLogsForJobs(jobs, { limitPerJob = 100 } = {}) {
  const results = await Promise.all(
    jobs.map(job =>
      fetchJobLogs(job.id, { limit: limitPerJob }).catch(() => [])
    )
  );

  return results
    .flat()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
