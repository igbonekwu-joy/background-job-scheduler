const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'jobs', label: 'Jobs', icon: 'list' },
  { key: 'dlq', label: 'DLQ', icon: 'alert' },
];

const ICONS = {
  grid: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  list: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="2" cy="3" r="1" fill="currentColor" />
      <circle cx="2" cy="8" r="1" fill="currentColor" />
      <circle cx="2" cy="13" r="1" fill="currentColor" />
      <line x1="5" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  alert: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L15 14H1L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="8" y1="6" x2="8" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.8" fill="currentColor" />
    </svg>
  ),
};

export default function Sidebar({ view, onNavigate, dlqCount }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-dot" />
        <span className="brand-name">queuectl</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            className={`nav-item ${view === item.key ? 'nav-item-active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="nav-icon">{ICONS[item.icon]}</span>
            <span>{item.label}</span>
            {item.key === 'dlq' && dlqCount > 0 && (
              <span className="nav-badge">{dlqCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-footer-text">background job worker</span>
      </div>
    </aside>
  );
}
