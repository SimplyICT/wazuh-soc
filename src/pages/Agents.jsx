import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useRefresh } from '../components/RefreshContext';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

const PI = { windows: '\uD83D\uFDB5', macos: '\uD83D\uFDB5', linux: '\uD83D\uDCBB', ios: '\uD83D\uDCF1', android: '\uD83D\uDCF1' };
function pi(p) { return PI[p] || '\u2753'; }
function fd(d) { if (!d) return '-'; try { return new Date(d).toLocaleString(); } catch { return d; } }
function filterAgents(all, online, filter) {
  if (filter === 'all') return all;
  if (filter === 'online') return online;
  return all.filter(x => x.status === 'offline');
}

export default function Agents() {
  const { key: rk } = useRefresh();
  const a = useApi(() => fetch('/api/agents/all').then(r => r.json()), [], rk);
  const o = useApi(() => fetch('/api/agents/online').then(r => r.json()), [], rk);
  const [f, sf] = useState('all');

  if (a.loading || o.loading) return <LoadingSpinner />;
  if (a.error) return <ErrorState message={a.error.message} onRetry={a.refetch} />;
  if (o.error) return <ErrorState message={o.error.message} onRetry={o.refetch} />;

  const all = a.data?.agents || [];
  const online = o.data?.agents || [];
  const oc = online.length, ofc = all.length - oc;
  const pc = {}; all.forEach(x => { pc[x.platform] = (pc[x.platform] || 0) + 1; });
  const fl = filterAgents(all, online, f);

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={all.length} label="Total Agents" color="accent" sub="all registered" />
        <KpiCard value={oc} label="Online" color="green" sub="WebSocket connected" />
        <KpiCard value={ofc} label="Offline" color="red" sub="no connection" />
        {Object.entries(pc).map(([p, c]) => <KpiCard key={p} value={c} label={p} color="accent" sub={pi(p)} />)}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">All Agents ({all.length})</div>
          <div className="filter-tabs" style={{ margin: 0 }}>
            <span className={`filter-tab ${f === 'all' ? 'active' : ''}`} onClick={() => sf('all')}>All</span>
            <span className={`filter-tab ${f === 'online' ? 'active' : ''}`} onClick={() => sf('online')}>Online ({oc})</span>
            <span className={`filter-tab ${f === 'offline' ? 'active' : ''}`} onClick={() => sf('offline')}>Offline ({ofc})</span>
          </div>
        </div>
        {fl.length === 0 ? (
          <div className="empty-state">No agents. Deploy via Our Agents page.</div>
        ) : (
          <div className="table-container" style={{ maxHeight: 600, overflow: 'auto' }}>
            <table>
              <thead><tr className="th-sticky">
                <th>Platform</th><th>Hostname</th><th>Version</th><th>Status</th><th>Last Seen</th>
              </tr></thead>
              <tbody>
                {fl.map((x, i) => (
                  <tr key={x.hostname}>
                    <td style={{ fontSize: 16 }} title={x.platform}>{pi(x.platform)}</td>
                    <td style={{ fontWeight: 600 }}>{x.hostname}</td>
                    <td className="text-sm text-secondary">{x.version}</td>
                    <td><span className={`badge ${x.status === 'online' ? 'badge-green' : 'badge-gray'}`}>{x.status}</span></td>
                    <td className="text-sm text-secondary">{fd(x.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
