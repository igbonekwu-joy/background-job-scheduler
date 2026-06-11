import { useState } from 'react';
import StatusPill from '../components/StatusPill';
import CreateJobModal from '../components/CreateJobModal';
import { PRIORITY_LABEL, fmtTime } from '../data/seed';

const CANCELLABLE = new Set(['pending', 'processing']);

export default function JobsPage({ jobs, onCreate, onCancel, sourceHint = '' }) {
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
              <th>attempts</th>
              <th>retries</th>
              <th>scheduled</th>
              <th>interval</th>
              <th>created</th>
              <th></th>
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
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CreateJobModal
          jobs={jobs}
          onClose={() => setShowModal(false)}
          onCreate={onCreate}
        />
      )}
    </div>
  );
}
