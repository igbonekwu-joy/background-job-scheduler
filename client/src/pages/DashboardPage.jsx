import { useMemo } from 'react';
import { STATUS_META } from '../data/seed';

export default function DashboardPage({ jobs }) {
  const counts = useMemo(() => {
    const c = { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 };
    jobs.forEach(j => { c[j.status] = (c[j.status] || 0) + 1; });
    return c;
  }, [jobs]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <span className="page-sub mono">{jobs.length} total jobs</span>
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
