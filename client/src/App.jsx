import { useEffect, useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import DLQPage from './pages/DLQPage';
import { fetchJobs, createJob, mapJobFromApi } from './api/jobs';
import { fetchDlqEntries, retryDlqEntry } from './api/dlq';
import { seedJobs, seedDLQ } from './data/seed';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState(seedJobs);
  const [dlq, setDlq] = useState(seedDLQ);
  const [dataSource, setDataSource] = useState('loading');
  const [toast, setToast] = useState('');

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchJobs(), fetchDlqEntries()])
      .then(([liveJobs, liveDlq]) => {
        if (!cancelled) {
          setJobs(liveJobs);
          setDlq(liveDlq);
          setDataSource('live');
        }
      })
      .catch(() => {
        if (!cancelled) setDataSource('local');
      });

    return () => { cancelled = true; };
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleCreate(jobInput) {
    if (dataSource !== 'live') {
      setJobs(prev => [jobInput, ...prev]);
      showToast(`Queued ${jobInput.id}`);
      return true;
    }

    try {
      const job = await createJob(jobInput);
      setJobs(prev => [job, ...prev]);
      showToast(`Queued ${job.id}`);
      return true;
    } catch (err) {
      showToast(err.message || 'Failed to queue job');
      return false;
    }
  }

  async function handleRetry(id) {
    if (dataSource !== 'live') {
      const entry = dlq.find(e => e.id === id);
      if (!entry) return;
      setDlq(prev => prev.filter(e => e.id !== id));
      setJobs(prev => [
        {
          id: entry.job_id ?? entry.id,
          type: entry.type,
          priority: entry.priority,
          status: 'pending',
          retry_count: 0,
          scheduled_time: new Date().toISOString(),
          interval: '-',
          created_time: new Date().toISOString(),
        },
        ...prev,
      ]);
      showToast(`Requeued ${entry.job_id ?? entry.id}`);
      return;
    }

    try {
      const result = await retryDlqEntry(id);
      setDlq(prev => prev.filter(e => e.id !== id));
      setJobs(prev => [mapJobFromApi(result.job), ...prev]);
      showToast(`Requeued ${result.job.id}`);
    } catch (err) {
      showToast(err.message || 'Failed to retry job');
    }
  }

  const sourceHint =
    dataSource === 'loading' ? ' · syncing…'
    : dataSource === 'local' ? ' · offline'
    : '';

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={setView} dlqCount={dlq.length} />

      <main className="app-content">
        {view === 'dashboard' && <DashboardPage jobs={jobs} />}
        {view === 'jobs' && (
          <JobsPage jobs={jobs} onCreate={handleCreate} sourceHint={sourceHint} />
        )}
        {view === 'dlq' && (
          <DLQPage entries={dlq} onRetry={handleRetry} sourceHint={sourceHint} />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
