import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';

export default function FIM() {
  const r = useApi(() => apiGet('/overview/fim'), []);
  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const items = r.data.affected_items || [];
  if (!items.length) return <EmptyState message="No FIM events" />;

  const columns = [
    { key: 'agent_id', label: 'Agent' },
    { key: 'file', label: 'File', render: r => r.file || r.path || '-' },
    { key: 'type', label: 'Event', render: r => r.type || 'modified' },
    { key: 'date', label: 'Date', render: r => r.date || r.mtime ? new Date(r.date || r.mtime).toLocaleString() : '-' },
  ];

  return (
    <div className="card">
      <DataTable columns={columns} data={items} />
    </div>
  );
}
