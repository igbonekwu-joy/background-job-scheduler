export const STATUS_META = {
  pending:   { label: 'pending',   color: '#F0883E' },
  processing:   { label: 'processing',   color: '#58A6FF' },
  completed: { label: 'completed', color: '#3FB950' },
  failed:    { label: 'failed',    color: '#F85149' },
  cancelled: { label: 'cancelled', color: '#7a768a' },
  dead:      { label: 'dead',      color: '#8B949E' },
};

export const PRIORITY_LABEL = { 1: 'high', 2: 'medium', 3: 'low' };

export const seedJobs = [
  { id: 'job_8f2a', name: 'Morning digest', type: 'send_email', priority: 1, status: 'completed', retry_count: 0, scheduled_time: '2026-06-10T08:00:00Z', interval: '-', created_time: '2026-06-10T07:58:11Z' },
  { id: 'job_91bd', name: 'Welcome email', type: 'send_email', priority: 2, status: 'processing', retry_count: 1, scheduled_time: '2026-06-10T08:05:00Z', interval: '-', created_time: '2026-06-10T08:04:40Z' },
  { id: 'job_a04c', name: 'Sync report', type: 'sync_report', priority: 3, status: 'pending', retry_count: 0, scheduled_time: '2026-06-10T08:30:00Z', interval: '15m', created_time: '2026-06-10T08:01:02Z' },
  { id: 'job_b711', name: 'Weekly digest', type: 'send_email', priority: 1, status: 'failed', retry_count: 3, scheduled_time: '2026-06-10T07:50:00Z', interval: '-', created_time: '2026-06-10T07:49:01Z' },
  { id: 'job_c220', name: 'Tmp cleanup', type: 'cleanup', priority: 3, status: 'dead', retry_count: 5, scheduled_time: '2026-06-10T06:00:00Z', interval: '1h', created_time: '2026-06-10T05:58:30Z' },
];

export const seedDLQ = [
  {
    id: 'job_b711',
    job_id: 'job_b711',
    name: 'Weekly digest',
    type: 'send_email',
    priority: 1,
    retry_count: 3,
    failed_at: '2026-06-10T07:55:42Z',
    error: 'SMTP 421: service temporarily unavailable',
    payload: { to: 'maria@dilamme.io', subject: 'Weekly digest' },
  },
  {
    id: 'job_c220',
    job_id: 'job_c220',
    name: 'Tmp cleanup',
    type: 'cleanup',
    priority: 3,
    retry_count: 5,
    failed_at: '2026-06-10T06:10:18Z',
    error: 'ECONNREFUSED: connection refused at 10.0.4.12:5432',
    payload: { target: 'tmp_uploads', older_than_days: 7 },
  },
];

export const seedLogs = [
  {
    id: 'log-001',
    job_id: 'job_8f2a',
    event: 'job.created',
    level: 'info',
    message: 'Job created: type=send_email, priority=1',
    metadata: { type: 'send_email', priority: 1, dependency_count: 0 },
    created_at: '2026-06-10T07:58:11Z',
  },
  {
    id: 'log-002',
    job_id: 'job_8f2a',
    event: 'job.started',
    level: 'info',
    message: 'Worker started send_email',
    metadata: { retry_count: 0 },
    created_at: '2026-06-10T08:00:02Z',
  },
  {
    id: 'log-003',
    job_id: 'job_8f2a',
    event: 'job.completed',
    level: 'info',
    message: 'Job completed successfully',
    metadata: { result: { to: 'maria@dilamme.io', message_id: '<job_8f2a@dilamme.io>' } },
    created_at: '2026-06-10T08:00:03Z',
  },
  {
    id: 'log-004',
    job_id: 'job_91bd',
    event: 'job.created',
    level: 'info',
    message: 'Job created: type=send_email, priority=2',
    metadata: { type: 'send_email', priority: 2 },
    created_at: '2026-06-10T08:04:40Z',
  },
  {
    id: 'log-005',
    job_id: 'job_91bd',
    event: 'job.started',
    level: 'info',
    message: 'Worker started send_email',
    metadata: { retry_count: 1 },
    created_at: '2026-06-10T08:05:01Z',
  },
  {
    id: 'log-006',
    job_id: 'job_b711',
    event: 'job.retry',
    level: 'warn',
    message: 'Attempt 2 failed. Retrying at 2026-06-10T07:52:00Z.',
    metadata: { error: 'SMTP 421: service temporarily unavailable', delay_ms: 5200, retry_count: 2 },
    created_at: '2026-06-10T07:51:55Z',
  },
  {
    id: 'log-007',
    job_id: 'job_b711',
    event: 'job.failed',
    level: 'error',
    message: 'Exhausted 3 retries. Sent to DLQ.',
    metadata: { error: 'SMTP 421: service temporarily unavailable', retry_count: 3 },
    created_at: '2026-06-10T07:55:42Z',
  },
];

export function fmtTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
