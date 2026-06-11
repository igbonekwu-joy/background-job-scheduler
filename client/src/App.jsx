import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import DLQPage from './pages/DLQPage';
import LogsPage from './pages/LogsPage';
import {
  fetchJobs,
  createJob,
  cancelJob,
  mapJobFromApi,
  mapStatsFromApi,
  fetchJobStats,
  DEFAULT_JOBS_PAGE_SIZE,
} from './api/jobs';
import {
  fetchDlqEntries,
  retryDlqEntry,
  removeDlqEntriesForJob,
  DEFAULT_DLQ_PAGE_SIZE,
} from './api/dlq';
import { seedJobs, seedDLQ } from './data/seed';
import { useJobEvents } from './hooks/useJobEvents';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState(seedJobs);
  const [dlq, setDlq] = useState(seedDLQ);
  const [dataSource, setDataSource] = useState('loading');
  const [toast, setToast] = useState('');

  const [liveStats, setLiveStats] = useState(null);
  const [logsRefresh, setLogsRefresh] = useState(0);
  const [jobsPagination, setJobsPagination] = useState({
    page: 1,
    limit: DEFAULT_JOBS_PAGE_SIZE,
    total: 0,
    total_jobs: 0,
    links: {},
  });
  const jobsPageRef = useRef(1);
  const jobsSearchRef = useRef('');
  const dlqPageRef = useRef(1);
  const [dlqPagination, setDlqPagination] = useState({
    page: 1,
    limit: DEFAULT_DLQ_PAGE_SIZE,
    total: 0,
    total_dlq: 0,
    links: {},
  });

  const loadJobsPage = useCallback(async (page = 1, search = jobsSearchRef.current) => {
    const result = await fetchJobs({
      page,
      limit: DEFAULT_JOBS_PAGE_SIZE,
      search: search?.trim() || undefined,
    });
    jobsPageRef.current = result.page;
    setJobs(result.jobs);
    setJobsPagination({
      page: result.page,
      limit: result.limit,
      total: result.total,
      total_jobs: result.total_jobs,
      links: result.links,
    });
    return result;
  }, []);

  const loadDlqPage = useCallback(async (page = 1) => {
    const result = await fetchDlqEntries({ page, limit: DEFAULT_DLQ_PAGE_SIZE });
    dlqPageRef.current = result.page;
    setDlq(result.entries);
    setDlqPagination({
      page: result.page,
      limit: result.limit,
      total: result.total,
      total_dlq: result.total_dlq,
      links: result.links,
    });
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchJobs({ page: 1, limit: DEFAULT_JOBS_PAGE_SIZE }),
      fetchDlqEntries({ page: 1, limit: DEFAULT_DLQ_PAGE_SIZE }),
      fetchJobStats(),
    ])
      .then(([jobsResult, dlqResult, stats]) => {
        if (cancelled) return;
        jobsPageRef.current = jobsResult.page;
        setJobs(jobsResult.jobs);
        setJobsPagination({
          page: jobsResult.page,
          limit: jobsResult.limit,
          total: jobsResult.total,
          total_jobs: jobsResult.total_jobs,
          links: jobsResult.links,
        });
        dlqPageRef.current = dlqResult.page;
        setDlq(dlqResult.entries);
        setDlqPagination({
          page: dlqResult.page,
          limit: dlqResult.limit,
          total: dlqResult.total,
          total_dlq: dlqResult.total_dlq,
          links: dlqResult.links,
        });
        setLiveStats(stats);
        setDataSource('live');
      })
      .catch(() => {
        if (!cancelled) setDataSource('local');
      });

    return () => { cancelled = true; };
  }, []);

  useJobEvents((event) => {
    if (event._type === 'stats') {
      setLiveStats(mapStatsFromApi(event.stats));
      if (typeof event.stats?.dlq_unresolved === 'number') {
        setDlqPagination(prev => ({
          ...prev,
          total_dlq: event.stats.dlq_unresolved,
        }));
      }
      return;
    }

    if (event._type === 'connected') {
      loadJobsPage(jobsPageRef.current).catch(() => {});
      loadDlqPage(dlqPageRef.current).catch(() => {});
      return;
    }

    loadJobsPage(jobsPageRef.current).catch(() => {});
    setLogsRefresh(n => n + 1);

    if (event.status === 'failed') {
      loadDlqPage(dlqPageRef.current).catch(() => {});
    }

    if (event.status === 'completed' && event.job_id && event.dlq_resolved) {
      setDlq(prev => removeDlqEntriesForJob(prev, event.job_id));
      loadDlqPage(dlqPageRef.current).catch(() => {});
    }
  }, { enabled: dataSource === 'live' });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleCreate(jobInput) {
    if (dataSource !== 'live') {
      setJobs(prev => [jobInput, ...prev]);
      showToast(`Queued ${jobInput.name || jobInput.id}`);
      return true;
    }

    try {
      const job = await createJob(jobInput);
      await loadJobsPage(1);
      showToast(`Queued ${job.id}`);
      return true;
    } catch (err) {
      showToast(err.message || 'Failed to queue job');
      return false;
    }
  }

  async function handleCancel(id) {
    const match = job => String(job.id).toLowerCase() === String(id).toLowerCase();

    if (dataSource !== 'live') {
      setJobs(prev => prev.map(j => match(j) ? { ...j, status: 'cancelled' } : j));
      showToast(`Cancelled ${id}`);
      return;
    }

    try {
      const job = await cancelJob(id);
      setJobs(prev => prev.map(j => match(j) ? job : j));
      showToast(`Cancelled ${job.id}`);
    } catch (err) {
      showToast(err.message || 'Failed to cancel job');
    }
  }

  async function handleRetry(id, payload) {
    if (dataSource !== 'live') {
      const entry = dlq.find(e => e.id === id);
      if (!entry) return;
      setDlq(prev => prev.filter(e => e.id !== id));
      setJobs(prev => [
        {
          id: entry.job_id ?? entry.id,
          name: entry.name ?? '',
          type: entry.type,
          priority: entry.priority,
          status: 'pending',
          retry_count: 0,
          scheduled_time: new Date().toISOString(),
          interval: '-',
          created_time: new Date().toISOString(),
          payload: payload ?? entry.payload ?? {},
        },
        ...prev,
      ]);
      showToast(`Requeued ${entry.job_id ?? entry.id}`);
      return;
    }

    try {
      const result = await retryDlqEntry(id, { payload });
      await loadDlqPage(dlqPageRef.current);
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
      <Sidebar
        view={view}
        onNavigate={setView}
        dlqCount={dataSource === 'live' ? dlqPagination.total_dlq : dlq.length}
      />

      <main className="app-content">
        {view === 'dashboard' && (
          <DashboardPage
            jobs={jobs}
            live={dataSource === 'live'}
            sseStats={liveStats}
            dlqCount={dataSource === 'live' ? dlqPagination.total_dlq : dlq.length}
          />
        )}
        {view === 'jobs' && (
          <JobsPage
            jobs={jobs}
            pagination={jobsPagination}
            live={dataSource === 'live'}
            onPageChange={loadJobsPage}
            onSearch={(term) => {
              jobsSearchRef.current = term;
              loadJobsPage(1, term).catch(() => {});
            }}
            onCreate={handleCreate}
            onCancel={handleCancel}
            sourceHint={sourceHint}
          />
        )}
        {view === 'logs' && (
          <LogsPage
            jobs={jobs}
            live={dataSource === 'live'}
            refreshToken={logsRefresh}
            sourceHint={sourceHint}
          />
        )}
        {view === 'dlq' && (
          <DLQPage
            entries={dlq}
            pagination={dlqPagination}
            live={dataSource === 'live'}
            onPageChange={loadDlqPage}
            onRetry={handleRetry}
            sourceHint={sourceHint}
          />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
