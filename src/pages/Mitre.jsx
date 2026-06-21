import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function Mitre() {
  const r = useApi(() => apiGet('/mitre'), []);
  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const items = r.data.affected_items || [];
  return (
    <div className="card">
      <div className="card-header"><div className="card-title">Techniques ({items.length})</div></div>
      <div className="mitre-grid">
        {items.slice(0, 100).map((t, i) => (
          <div
            key={i}
            className="mitre-cell"
            style={{ background: `rgba(0, 180, 216, ${Math.min(0.3 + (t.score || 0) / 100, 1)})` }}
            title={t.description || ''}
          >{t.id || t.technique || '-'}</div>
        ))}
      </div>
    </div>
  );
}
