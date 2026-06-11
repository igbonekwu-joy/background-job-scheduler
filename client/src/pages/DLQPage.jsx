import { useState } from 'react';
import { DEFAULT_DLQ_PAGE_SIZE } from '../api/dlq';
import { PRIORITY_LABEL, fmtTime } from '../data/seed';

const EMPTY_PAGINATION = {
  page: 1,
  limit: DEFAULT_DLQ_PAGE_SIZE,
  total: 0,
  total_dlq: 0,
  links: {},
};

function formatPayload(payload) {
  return JSON.stringify(payload ?? {}, null, 2);
}

function parsePayload(raw) {
  const trimmed = raw.trim();
  const parsed = trimmed ? JSON.parse(trimmed) : {};
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Payload must be a JSON object');
  }
  return parsed;
}

export default function DLQPage({
  entries,
  pagination = EMPTY_PAGINATION,
  live = false,
  onPageChange,
  onRetry,
  sourceHint = '',
}) {
  const [pageLoading, setPageLoading] = useState(false);
  const [payloadEdits, setPayloadEdits] = useState({});
  const [payloadErrors, setPayloadErrors] = useState({});
  const { page, total, total_dlq, links } = pagination;

  const recordLabel = live
    ? `${total_dlq} total · page ${page} of ${Math.max(total, 1)}`
    : `${entries.length} jobs need attention`;

  async function goToPage(nextPage) {
    if (!live || !onPageChange || nextPage < 1 || nextPage > total) return;
    setPageLoading(true);
    try {
      await onPageChange(nextPage);
    } finally {
      setPageLoading(false);
    }
  }

  function updatePayload(entryId, value) {
    setPayloadEdits(prev => ({ ...prev, [entryId]: value }));
    if (payloadErrors[entryId]) {
      setPayloadErrors(prev => ({ ...prev, [entryId]: '' }));
    }
  }

  function handleRetry(entryId) {
    try {
      const payload = parsePayload(payloadEdits[entryId] ?? '');
      setPayloadErrors(prev => ({ ...prev, [entryId]: '' }));
      onRetry(entryId, payload);
    } catch (err) {
      setPayloadErrors(prev => ({
        ...prev,
        [entryId]: err.message || 'Invalid JSON',
      }));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dead letter queue</h1>
        <span className="page-sub mono">
          {recordLabel}{sourceHint}
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
                  <span className="dlq-id" title={entry.job_id ?? entry.id}>
                    {entry.name || entry.job_id || entry.id}
                  </span>
                  <span className="dlq-type">{entry.type}</span>
                </div>
                <button className="retry-btn" onClick={() => handleRetry(entry.id)}>
                  Retry job
                </button>
              </div>
              <div className="dlq-error">{entry.error}</div>
              <div className="dlq-meta">
                <span><span className={`prio prio-${entry.priority}`}>{PRIORITY_LABEL[entry.priority]}</span> priority</span>
                <span>{entry.retry_count} retries used</span>
                <span>failed {fmtTime(entry.failed_at)}</span>
              </div>
              <details className="dlq-payload" open>
                <summary>payload</summary>
                <textarea
                  className="dlq-payload-input mono"
                  rows={6}
                  spellCheck={false}
                  value={payloadEdits[entry.id] ?? formatPayload(entry.payload)}
                  onFocus={() => {
                    if (payloadEdits[entry.id] === undefined) {
                      updatePayload(entry.id, formatPayload(entry.payload));
                    }
                  }}
                  onChange={e => updatePayload(entry.id, e.target.value)}
                />
                {payloadErrors[entry.id] && (
                  <div className="form-error dlq-payload-error">{payloadErrors[entry.id]}</div>
                )}
              </details>
            </div>
          ))}
        </div>
      )}

      {live && total > 1 && (
        <nav className="pagination" aria-label="DLQ pagination">
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
