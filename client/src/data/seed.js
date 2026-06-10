export const STATUS_META = {
  pending:   { label: 'pending',   color: '#F0883E' },
  running:   { label: 'running',   color: '#58A6FF' },
  completed: { label: 'completed', color: '#3FB950' },
  failed:    { label: 'failed',    color: '#F85149' },
  dead:      { label: 'dead',      color: '#8B949E' },
};

export const PRIORITY_LABEL = { 1: 'high', 2: 'medium', 3: 'low' };

export const seedJobs = [
  { id: 'job_8f2a', type: 'send_email', priority: 1, status: 'completed', retry_count: 0, scheduled_time: '2026-06-10T08:00:00Z', interval: '-', created_time: '2026-06-10T07:58:11Z' },
  { id: 'job_91bd', type: 'send_email', priority: 2, status: 'running', retry_count: 1, scheduled_time: '2026-06-10T08:05:00Z', interval: '-', created_time: '2026-06-10T08:04:40Z' },
  { id: 'job_a04c', type: 'sync_report', priority: 3, status: 'pending', retry_count: 0, scheduled_time: '2026-06-10T08:30:00Z', interval: '15m', created_time: '2026-06-10T08:01:02Z' },
  { id: 'job_b711', type: 'send_email', priority: 1, status: 'failed', retry_count: 3, scheduled_time: '2026-06-10T07:50:00Z', interval: '-', created_time: '2026-06-10T07:49:01Z' },
  { id: 'job_c220', type: 'cleanup', priority: 3, status: 'dead', retry_count: 5, scheduled_time: '2026-06-10T06:00:00Z', interval: '1h', created_time: '2026-06-10T05:58:30Z' },
];

export const seedDLQ = [
  {
    id: 'job_b711',
    type: 'send_email',
    priority: 1,
    retry_count: 3,
    failed_at: '2026-06-10T07:55:42Z',
    error: 'SMTP 421: service temporarily unavailable',
    payload: { to: 'maria@dilamme.io', subject: 'Weekly digest' },
  },
  {
    id: 'job_c220',
    type: 'cleanup',
    priority: 3,
    retry_count: 5,
    failed_at: '2026-06-10T06:10:18Z',
    error: 'ECONNREFUSED: connection refused at 10.0.4.12:5432',
    payload: { target: 'tmp_uploads', older_than_days: 7 },
  },
];

export function fmtTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
