import { STATUS_META } from '../data/seed';

export default function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className="pill" style={{ '--pill-color': meta.color }}>
      <span className={`led ${status === 'processing' ? 'led-pulse' : ''}`} style={{ '--pill-color': meta.color }} />
      {meta.label}
    </span>
  );
}
