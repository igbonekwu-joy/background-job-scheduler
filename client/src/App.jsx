import { useEffect, useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import DLQPage from './pages/DLQPage';
import { fetchJobs, createJob, mapJobFromApi, applyJobEventUpdate, mapStatsFromApi, fetchJobStats } from './api/jobs';
import { fetchDlqEntries, retryDlqEntry } from './api/dlq';
import { seedJobs, seedDLQ } from './data/seed';
import { useJobEvents } from './hooks/useJobEvents';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState(seedJobs);
  const [dlq, setDlq] = useState(seedDLQ);
  const [dataSource, setDataSource] = useState('loading');
  const [toast, setToast] = useState('');

  const [liveStats, setLiveStats] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchJobs(), fetchDlqEntries(), fetchJobStats()])
      .then(([liveJobs, liveDlq, stats]) => {
        if (!cancelled) {
          setJobs(liveJobs);
          setDlq(liveDlq);
          setLiveStats(stats);
          setDataSource('live');
        }
      })
      .catch(() => {
        if (!cancelled) setDataSource('local');
      });

    return () => { cancelled = true; };
  }, []);

  useJobEvents((event) => {
    if (event._type === 'stats') {
      setLiveStats(mapStatsFromApi(event.stats));
      return;
    }

    setJobs(prev => {
      const exists = prev.some(job => job.id === event.job_id);
      if (!exists) return prev;
      return prev.map(job => applyJobEventUpdate(job, event));
    });

    if (event.status === 'failed') {
      fetchDlqEntries().then(setDlq).catch(() => {});
    }
  }, { enabled: dataSource === 'live' });

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
        {view === 'dashboard' && (
          <DashboardPage
            jobs={jobs}
            live={dataSource === 'live'}
            sseStats={liveStats}
            dlqCount={dlq.length}
          />
        )}
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
