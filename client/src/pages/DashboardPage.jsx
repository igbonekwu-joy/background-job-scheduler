import { useEffect, useMemo, useState } from 'react';
import { fetchJobStats } from '../api/jobs';
import { STATUS_META } from '../data/seed';

export default function DashboardPage({ jobs, live = false, sseStats = null, dlqCount = 0 }) {
  const [fetchedStats, setFetchedStats] = useState(null);
  const [fetchState, setFetchState] = useState(() => (live ? 'skipped' : 'loading'));

  const jobCounts = useMemo(() => {
    const c = { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 };
    jobs.forEach(j => { c[j.status] = (c[j.status] || 0) + 1; });
    return c;
  }, [jobs]);

  useEffect(() => {
    if (live) return;

    let cancelled = false;

    fetchJobStats()
      .then(result => {
        if (!cancelled) {
          setFetchedStats(result);
          setFetchState('done');
        }
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });

    return () => { cancelled = true; };
  }, [live]);

  const counts = live
    ? { ...jobCounts, dead: dlqCount }
    : (fetchedStats?.counts ?? { ...jobCounts, dead: dlqCount });

  const totalJobs = live
    ? (sseStats?.totalJobs ?? jobs.length)
    : (fetchedStats?.totalJobs ?? jobs.length);

  const statsSource = live
    ? 'live'
    : fetchState === 'loading' ? 'loading'
    : fetchState === 'error' ? 'local'
    : 'live';

  const statusHint =
    statsSource === 'loading' ? ' · syncing…'
    : statsSource === 'local' ? ' · offline'
    : live ? ' · live'
    : '';

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <span className="page-sub mono">
          {totalJobs} total jobs{statusHint}
        </span>
      </div>

      <div className="stat-grid">
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <div className="stat-card" key={key}>
            <div className="stat-top">
              <span className="led" style={{ '--pill-color': meta.color }} />
              <span className="stat-label">{meta.label}</span>
            </div>
            <div className="stat-value">{counts[key] ?? 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
