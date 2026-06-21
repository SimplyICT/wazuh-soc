const CLASS_MAP = {
  open: 'badge-gray', triaged: 'badge-accent', awaiting_approval: 'badge-amber',
  approved: 'badge-green', resolved: 'badge-green', closed: 'badge-gray',
  rejected: 'badge-red', partial: 'badge-amber',
};

export default function CaseStatusBadge({ status }) {
  return <span className={`badge ${CLASS_MAP[status] || 'badge-gray'}`}>{status}</span>;
}
