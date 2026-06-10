import { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import DLQPage from './pages/DLQPage';
import { seedJobs, seedDLQ } from './data/seed';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState(seedJobs);
  const [dlq, setDlq] = useState(seedDLQ);
  const [toast, setToast] = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function handleCreate(job) {
    setJobs(prev => [job, ...prev]);
    showToast(`Queued ${job.id}`);
  }

  function handleRetry(id) {
    const entry = dlq.find(e => e.id === id);
    if (!entry) return;
    setDlq(prev => prev.filter(e => e.id !== id));
    setJobs(prev => [
      {
        id: entry.id,
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
    showToast(`Requeued ${id}`);
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={setView} dlqCount={dlq.length} />

      <main className="app-content">
        {view === 'dashboard' && <DashboardPage jobs={jobs} />}
        {view === 'jobs' && <JobsPage jobs={jobs} onCreate={handleCreate} />}
        {view === 'dlq' && <DLQPage entries={dlq} onRetry={handleRetry} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
