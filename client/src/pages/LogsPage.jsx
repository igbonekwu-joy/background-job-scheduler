import { useEffect, useMemo, useState } from 'react';
import { fetchJobLogs, fetchLogsForJobs } from '../api/logs';
import { seedLogs, fmtTime } from '../data/seed';

const EVENTS = [
  'job.created',
  'job.started',
  'job.retry',
  'job.failed',
  'job.cancelled',
  'job.completed',
];

const LEVEL_CLASS = {
  info: 'log-level-info',
  warn: 'log-level-warn',
  error: 'log-level-error',
};

function filterLogs(logs, { jobId, event, level }) {
  return logs.filter(log => {
    if (jobId !== 'all' && log.job_id !== jobId) return false;
    if (event !== 'all' && log.event !== event) return false;
    if (level !== 'all' && log.level !== level) return false;
    return true;
  });
}

function hasMetadata(meta) {
  return meta && typeof meta === 'object' && Object.keys(meta).length > 0;
}

export default function LogsPage({ jobs, live, refreshToken, sourceHint = '' }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('all');
  const [event, setEvent] = useState('all');
  const [level, setLevel] = useState('all');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        if (!live) {
          if (!cancelled) setLogs(seedLogs);
          return;
        }

        const data = jobId === 'all'
          ? await fetchLogsForJobs(jobs)
          : await fetchJobLogs(jobId);

        if (!cancelled) {
          setLogs(jobId === 'all'
            ? data
            : [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load logs');
          setLogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [jobs, live, jobId, refreshToken]);

  const filtered = useMemo(
    () => filterLogs(logs, { jobId, event, level }),
    [logs, jobId, event, level]
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Logs</h1>
        <span className="page-sub mono">
          {filtered.length} events{sourceHint}
        </span>
      </div>

      <div className="logs-toolbar">
        <label className="logs-filter">
          <span>Job</span>
          <select value={jobId} onChange={e => setJobId(e.target.value)}>
            <option value="all">All jobs</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>{j.id.slice(0, 8)}… — {j.type}</option>
            ))}
          </select>
        </label>

        <label className="logs-filter">
          <span>Event</span>
          <select value={event} onChange={e => setEvent(e.target.value)}>
            <option value="all">All events</option>
            {EVENTS.map(ev => (
              <option key={ev} value={ev}>{ev}</option>
            ))}
          </select>
        </label>

        <label className="logs-filter">
          <span>Level</span>
          <select value={level} onChange={e => setLevel(e.target.value)}>
            <option value="all">All levels</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </label>
      </div>

      {error && <div className="form-error logs-error">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading structured logs…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No log entries match the current filters.</div>
      ) : (
        <div className="table-wrap logs-table-wrap">
          <table className="logs-table">
            <thead>
              <tr>
                <th>time</th>
                <th>job</th>
                <th>event</th>
                <th>level</th>
                <th>message</th>
                <th>metadata</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <tr key={log.id} className={`log-row log-row-${log.level}`}>
                  <td className="mono log-time">{fmtTime(log.created_at)}</td>
                  <td className="mono log-job" title={log.job_id}>
                    {String(log.job_id).slice(0, 8)}…
                  </td>
                  <td><span className="log-event">{log.event}</span></td>
                  <td>
                    <span className={`log-level ${LEVEL_CLASS[log.level] ?? ''}`}>
                      {log.level}
                    </span>
                  </td>
                  <td className="log-message">{log.message}</td>
                  <td className="log-metadata-cell">
                    {hasMetadata(log.metadata) ? (
                      <details className="log-metadata">
                        <summary className="mono">view</summary>
                        <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                      </details>
                    ) : (
                      <span className="log-metadata-empty">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
