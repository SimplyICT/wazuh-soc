import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function Rules() {
  const r = useApi(() => Promise.all([apiGet('/rules?limit=50'), apiGet('/decoders?limit=50')]), []);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const [rulesRes, decodersRes] = r.data;
  const rules = rulesRes.affected_items || [];
  const decoders = decodersRes.affected_items || [];

  const ruleColumns = [
    { key: 'id', label: 'ID' },
    { key: 'level', label: 'Level' },
    { key: 'description', label: 'Description', render: r => (r.description || '').substring(0, 80) },
    { key: 'groups', label: 'Group', render: r => (r.groups || []).join(', ') },
  ];

  const decoderColumns = [
    { key: 'name', label: 'Name' },
    { key: 'parent', label: 'Parent' },
    { key: 'filename', label: 'Filename' },
  ];

  return (
    <>
      <div className="card">
        <div className="card-header"><div className="card-title">Rules ({rules.length}+)</div></div>
        <DataTable columns={ruleColumns} data={rules} />
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Decoders ({decoders.length}+)</div></div>
        <DataTable columns={decoderColumns} data={decoders} />
      </div>
    </>
  );
}
