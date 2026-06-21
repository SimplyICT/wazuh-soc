import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import KpiCard from '../components/KpiCard';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function SCA() {
  const r = useApi(() => apiGet('/overview/sca'), []);
  const navigate = useNavigate();

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const items = r.data.affected_items || [];
  const scores = items.filter(i => i.score != null).map(i => i.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const avgColor = avg >= 80 ? 'green' : avg >= 50 ? 'amber' : 'red';

  const columns = [
    { key: 'agent_id', label: 'Agent', render: r => r.agent_id || '-' },
    { key: 'policy', label: 'Policy', render: r => r.policy || '-' },
    { key: 'score', label: 'Score', render: r => {
      const s = r.score;
      const c = s >= 80 ? 'green' : s >= 50 ? 'amber' : 'red';
      return <span style={{ color: `var(--${c})` }}>{s != null ? `${s}%` : '-'}</span>;
    }},
    { key: 'passed', label: 'Passed' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={`${avg}%`} label="Avg Compliance" color={avgColor} />
        <KpiCard value={items.length} label="Policies" color="accent" />
      </div>
      <div className="card">
        <DataTable columns={columns} data={items} onRowClick={row => navigate(`/agent/${row.agent_id}`)} />
      </div>
    </>
  );
}
