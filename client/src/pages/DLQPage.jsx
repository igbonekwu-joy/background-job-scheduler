import { PRIORITY_LABEL, fmtTime } from '../data/seed';

export default function DLQPage({ entries, onRetry, sourceHint = '' }) {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Dead letter queue</h1>
        <span className="page-sub mono">
          {entries.length} jobs need attention{sourceHint}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">Nothing here. Failed jobs that exhaust retries will show up in this list.</div>
      ) : (
        <div className="dlq-list">
          {entries.map(entry => (
            <div className="dlq-card" key={entry.id}>
              <div className="dlq-head">
                <div>
                  <span className="mono dlq-id">{entry.job_id ?? entry.id}</span>
                  <span className="dlq-type">{entry.type}</span>
                </div>
                <button className="retry-btn" onClick={() => onRetry(entry.id)}>
                  Retry job
                </button>
              </div>
              <div className="dlq-error">{entry.error}</div>
              <div className="dlq-meta">
                <span><span className={`prio prio-${entry.priority}`}>{PRIORITY_LABEL[entry.priority]}</span> priority</span>
                <span>{entry.retry_count} retries used</span>
                <span>failed {fmtTime(entry.failed_at)}</span>
              </div>
              <details className="dlq-payload">
                <summary>payload</summary>
                <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
