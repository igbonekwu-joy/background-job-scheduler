import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchJobLogs, DEFAULT_LOGS_PAGE_SIZE } from '../api/logs';
import { seedLogs, fmtTime } from '../data/seed';

const EVENTS = [
  'job.created',
  'job.held',
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

const EMPTY_PAGINATION = {
  page: 1,
  limit: DEFAULT_LOGS_PAGE_SIZE,
  total: 0,
  total_logs: 0,
  links: {},
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
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('all');
  const [event, setEvent] = useState('all');
  const [level, setLevel] = useState('all');
  const pageRef = useRef(1);
  const filtersRef = useRef({ jobId: 'all', event: 'all', level: 'all' });

  useEffect(() => {
    let cancelled = false;

    async function load(page = 1) {
      setLoading(true);
      setError('');

      try {
        if (!live) {
          if (!cancelled) {
            setLogs(seedLogs);
            setPagination(EMPTY_PAGINATION);
          }
          return;
        }

        const result = await fetchJobLogs(jobId, {
          page,
          limit: DEFAULT_LOGS_PAGE_SIZE,
          event,
          level,
        });

        if (!cancelled) {
          pageRef.current = result.page;
          setLogs(result.logs);
          setPagination({
            page: result.page,
            limit: result.limit,
            total: result.total,
            total_logs: result.total_logs,
            links: result.links,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load logs');
          setLogs([]);
          setPagination(EMPTY_PAGINATION);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const filtersChanged =
      filtersRef.current.jobId !== jobId ||
      filtersRef.current.event !== event ||
      filtersRef.current.level !== level;

    if (filtersChanged) {
      pageRef.current = 1;
      filtersRef.current = { jobId, event, level };
    }

    const page = filtersChanged ? 1 : pageRef.current;
    load(page);
    return () => { cancelled = true; };
  }, [live, jobId, event, level, refreshToken]);

  async function goToPage(nextPage) {
    if (!live || nextPage < 1 || nextPage > pagination.total) return;
    setPageLoading(true);
    setError('');

    try {
      const result = await fetchJobLogs(jobId, {
        page: nextPage,
        limit: DEFAULT_LOGS_PAGE_SIZE,
        event,
        level,
      });
      pageRef.current = result.page;
      setLogs(result.logs);
      setPagination({
        page: result.page,
        limit: result.limit,
        total: result.total,
        total_logs: result.total_logs,
        links: result.links,
      });
    } catch (err) {
      setError(err.message || 'Failed to load logs');
    } finally {
      setPageLoading(false);
    }
  }

  const filtered = useMemo(
    () => (live ? logs : filterLogs(logs, { jobId, event, level })),
    [logs, live, jobId, event, level]
  );

  const { page, total, total_logs, links } = pagination;
  const recordLabel = live
    ? `${total_logs} total · page ${page} of ${Math.max(total, 1)}`
    : `${filtered.length} events`;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Logs</h1>
        <span className="page-sub mono">
          {recordLabel}{sourceHint}
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

      {live && total > 1 && (
        <nav className="pagination" aria-label="Logs pagination">
          <button
            type="button"
            className="btn-ghost"
            disabled={!links.prev || pageLoading}
            onClick={() => goToPage(page - 1)}
          >
            Previous
          </button>
          <span className="pagination-status mono">
            Page {page} of {total}
          </span>
          <button
            type="button"
            className="btn-ghost"
            disabled={!links.next || pageLoading}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
