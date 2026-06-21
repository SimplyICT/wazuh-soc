import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function Groups() {
  const r = useApi(() => apiGet('/groups'), []);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const items = r.data.affected_items || [];
  const columns = [
    { key: 'name', label: 'Group' },
    { key: 'count', label: 'Count' },
  ];

  return (
    <div className="card">
      <DataTable columns={columns} data={items} />
    </div>
  );
}
