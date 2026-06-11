import { useMemo, useRef, useState } from 'react';
import StatusPill from '../components/StatusPill';
import CreateJobModal from '../components/CreateJobModal';
import { PRIORITY_LABEL, fmtTime } from '../data/seed';
import { filterJobs, formatDependencyLabels } from '../api/jobs';

const CANCELLABLE = new Set(['pending', 'processing']);

const EMPTY_PAGINATION = { page: 1, limit: 20, total: 0, total_jobs: 0, links: {} };

export default function JobsPage({
  jobs,
  pagination = EMPTY_PAGINATION,
  live = false,
  onPageChange,
  onSearch,
  onCreate,
  onCancel,
  sourceHint = '',
}) {
  const [showModal, setShowModal] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef(null);

  const { page, total, total_jobs, links } = pagination;
  const nameById = useMemo(() => {
    const map = new Map();
    for (const job of jobs) map.set(job.id, job.name || job.id);
    return map;
  }, [jobs]);

  const displayJobs = live ? jobs : filterJobs(jobs, search);
  const recordLabel = live
    ? `${total_jobs} total · page ${page} of ${Math.max(total, 1)}`
    : `${displayJobs.length} of ${jobs.length} records`;

  function handleSearchChange(value) {
    setSearch(value);
    if (!live) return;

    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      onSearch?.(value);
    }, 300);
  }

  async function goToPage(nextPage) {
    if (!live || !onPageChange || nextPage < 1 || nextPage > total) return;
    setPageLoading(true);
    try {
      await onPageChange(nextPage);
    } finally {
      setPageLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Jobs</h1>
        <div className="page-head-actions">
          <span className="page-sub mono">{recordLabel}{sourceHint}</span>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Create job
          </button>
        </div>
      </div>

      <div className="jobs-toolbar">
        <input
          type="search"
          className="jobs-search"
          placeholder="Search by name, type, status, or id…"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          aria-label="Search jobs"
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>name</th>
              <th>type</th>
              <th>priority</th>
              <th>status</th>
              <th>dependencies</th>
              <th>attempts</th>
              <th>retries</th>
              <th>scheduled</th>
              <th>interval</th>
              <th>created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayJobs.length === 0 ? (
              <tr>
                <td colSpan={12} className="table-empty">
                  {search.trim() ? 'No jobs match your search.' : 'No jobs yet.'}
                </td>
              </tr>
            ) : (
              displayJobs.map(j => (
                <tr key={j.id}>
                  <td className="mono job-id" title={j.id}>{j.id}</td>
                  <td>{j.name || '—'}</td>
                  <td>{j.type}</td>
                  <td><span className={`prio prio-${j.priority}`}>{PRIORITY_LABEL[j.priority]}</span></td>
                  <td><StatusPill status={j.status} /></td>
                  <td className="job-deps" title={formatDependencyLabels(j.dependencies, nameById)}>
                    {formatDependencyLabels(j.dependencies, nameById)}
                  </td>
                  <td className="mono">{j.retry_count}</td>
                  <td className="mono">{j.retry_count > 0 ? j.retry_count - 1 : j.retry_count}</td>
                  <td className="mono">{fmtTime(j.scheduled_time)}</td>
                  <td className="mono">{j.interval}</td>
                  <td className="mono">{fmtTime(j.created_time)}</td>
                  <td>
                    {CANCELLABLE.has(j.status) && (
                      <button type="button" className="cancel-btn" onClick={() => onCancel(j.id)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {live && total > 1 && (
        <nav className="pagination" aria-label="Jobs pagination">
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

      {showModal && (
        <CreateJobModal
          live={live}
          jobs={jobs}
          onClose={() => setShowModal(false)}
          onCreate={onCreate}
        />
      )}
    </div>
  );
}
