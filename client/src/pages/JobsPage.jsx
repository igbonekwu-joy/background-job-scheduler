import { useState } from 'react';
import StatusPill from '../components/StatusPill';
import CreateJobModal from '../components/CreateJobModal';
import { PRIORITY_LABEL, fmtTime } from '../data/seed';

export default function JobsPage({ jobs, onCreate, sourceHint = '' }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Jobs</h1>
        <div className="page-head-actions">
          <span className="page-sub mono">{jobs.length} records{sourceHint}</span>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Create job
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>type</th>
              <th>priority</th>
              <th>status</th>
              <th>retries</th>
              <th>scheduled</th>
              <th>interval</th>
              <th>created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td className="mono">{j.id}</td>
                <td>{j.type}</td>
                <td><span className={`prio prio-${j.priority}`}>{PRIORITY_LABEL[j.priority]}</span></td>
                <td><StatusPill status={j.status} /></td>
                <td className="mono">{j.retry_count}</td>
                <td className="mono">{fmtTime(j.scheduled_time)}</td>
                <td className="mono">{j.interval}</td>
                <td className="mono">{fmtTime(j.created_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CreateJobModal onClose={() => setShowModal(false)} onCreate={onCreate} />
      )}
    </div>
  );
}
