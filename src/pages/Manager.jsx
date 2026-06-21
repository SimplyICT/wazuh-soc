import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function Manager() {
  const r = useApi(() => Promise.all([apiGet('/manager'), apiGet('/manager/info')]), []);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const [daemonsRes, mgrRes] = r.data;
  const daemons = daemonsRes.affected_items ? daemonsRes.affected_items[0] : {};
  const mgr = mgrRes.affected_items ? mgrRes.affected_items[0] : {};
  const dl = Object.keys(daemons).filter(k => k !== 'name');

  return (
    <>
      <div className="kpi-row">
        {dl.map(d => {
          const running = daemons[d] === 'running';
          return (
            <div key={d} className="kpi-card">
              <div className="kpi-value" style={{ fontSize: 14, color: running ? 'var(--green)' : 'var(--red)' }}>
                {running ? 'Running' : 'Stopped'}
              </div>
              <div className="kpi-label">{d}</div>
            </div>
          );
        })}
      </div>
      <div className="cols-2">
        <div className="card">
          <div className="card-header"><div className="card-title">Manager Info</div></div>
          <table><tbody>
            <tr><td>Version</td><td>{mgr.version || '-'}</td></tr>
            <tr><td>Hostname</td><td>{mgr.hostname || mgr.name || '-'}</td></tr>
            <tr><td>Type</td><td>{mgr.type || '-'}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Cluster</div></div>
          <table><tbody>
            <tr><td>Status</td><td>{mgr.cluster_status || 'N/A'}</td></tr>
            <tr><td>Node</td><td>{mgr.node_name || mgr.node || '-'}</td></tr>
          </tbody></table>
        </div>
      </div>
    </>
  );
}
