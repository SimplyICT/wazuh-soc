export default function StatusBadge({ status }) {
  const cls = status === 'active' ? 'badge-green' : status === 'offline' ? 'badge-red' : 'badge-gray';
  const dotCls = status === 'active' ? 'status-active' : status === 'offline' ? 'status-offline' : 'status-never_connected';
  return (
    <span className={`badge ${cls}`}>
      <span className={`status-dot ${dotCls}`}></span>
      {status}
    </span>
  );
}
