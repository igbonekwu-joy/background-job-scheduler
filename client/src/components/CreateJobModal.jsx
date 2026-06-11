import { useEffect, useState } from 'react';
import { fetchJobs } from '../api/jobs';

export default function CreateJobModal({ jobs = [], live = false, onClose, onCreate }) {
  const [dependencyJobs, setDependencyJobs] = useState(jobs);
  const [form, setForm] = useState({
    type: 'send_email',
    priority: 2,
    scheduled_time: '',
    interval: '',
    payload: '',
    dependencies: [],
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!live) {
      setDependencyJobs(jobs);
      return;
    }

    let cancelled = false;
    fetchJobs({ page: 1, limit: 100 })
      .then(result => {
        if (!cancelled) setDependencyJobs(result.jobs);
      })
      .catch(() => {
        if (!cancelled) setDependencyJobs(jobs);
      });

    return () => { cancelled = true; };
  }, [live, jobs]);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleDependency(id) {
    setForm(f => ({
      ...f,
      dependencies: f.dependencies.includes(id)
        ? f.dependencies.filter(dep => dep !== id)
        : [...f.dependencies, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.type.trim()) {
      setError('Job type is required.');
      return;
    }
    if (!form.scheduled_time) {
      setError('Scheduled time is required.');
      return;
    }
    let parsedPayload = {};
    if (form.payload.trim()) {
      try {
        parsedPayload = JSON.parse(form.payload);
      } catch {
        setError('Payload must be valid JSON.');
        return;
      }
    }

    const job = {
      id: `job_${Math.random().toString(16).slice(2, 6)}`,
      type: form.type.trim(),
      priority: Number(form.priority),
      status: 'pending',
      retry_count: 0,
      scheduled_time: new Date(form.scheduled_time).toISOString(),
      interval: form.interval.trim() || '-',
      created_time: new Date().toISOString(),
      payload: parsedPayload,
      dependencies: form.dependencies,
    };

    const ok = await onCreate(job);
    if (ok !== false) onClose();
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <h2 id="modal-title">Create job</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="job-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="type">Job type</label>
            <select
              id="type"
              value={form.type}
              onChange={e => update('type', e.target.value)}
              autoFocus
            >
              <option value="send_email">Send Email</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="priority">Priority</label>
            <select id="priority" value={form.priority} onChange={e => update('priority', e.target.value)}>
              <option value={1}>1 — high</option>
              <option value={2}>2 — medium</option>
              <option value={3}>3 — low</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="scheduled">Scheduled time</label>
            <input
              id="scheduled"
              type="datetime-local"
              value={form.scheduled_time}
              onChange={e => update('scheduled_time', e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="interval">Repeat interval (optional)</label>
            <select id="interval" value={form.interval} onChange={e => update('interval', e.target.value)}>
              <option value="">None</option>
              <option value="every_1_minute">Every 1 minute</option>
              <option value="every_5_minutes">Every 5 minutes</option>
              <option value="every_1_hour">Every 1 hour</option>
            </select>
          </div>

          <div className="field field-wide">
            <span className="field-label">Dependencies (optional)</span>
            <p className="field-hint">This job will not run until every selected job has completed.</p>
            {dependencyJobs.length === 0 ? (
              <p className="field-hint">No jobs available yet.</p>
            ) : (
              <div className="dependency-list" role="group" aria-label="Job dependencies">
                {dependencyJobs.map(j => (
                  <label key={j.id} className="dependency-option">
                    <input
                      type="checkbox"
                      checked={form.dependencies.includes(j.id)}
                      onChange={() => toggleDependency(j.id)}
                    />
                    <span className="mono">{j.id}</span>
                    <span>{j.type}</span>
                    <span className="dependency-status">{j.status}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="field field-wide">
            <label htmlFor="payload">Payload (JSON, optional)</label>
            <textarea
              id="payload"
              rows={4}
              placeholder='{"to": "user@example.com", "subject": "Hello"}'
              value={form.payload}
              onChange={e => update('payload', e.target.value)}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="field field-wide modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Queue job</button>
          </div>
        </form>
      </div>
    </div>
  );
}
