import { useApi } from '../hooks/useApi';
import { useRefresh } from '../components/RefreshContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

const PLATFORM_STYLE = {
  windows: { label: 'Windows', icon: '\u{1F5A5}', color: '#00b4d8' },
  linux: { label: 'Linux', icon: '\u{1F4BB}', color: '#00ff88' },
  macos: { label: 'macOS', icon: '\u{1F5B4}', color: '#a29bfe' },
};

export default function Topology() {
  const { key: rk } = useRefresh();
  const r = useApi(() => fetch('/api/agents/all').then(r => r.json()), [], rk);
  const o = useApi(() => fetch('/api/agents/online').then(r => r.json()), [], rk);

  if (r.loading || o.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const all = r.data?.agents || [];
  const onlineIds = new Set((o.data?.agents || []).map(a => a.id));
  const onlineCount = (o.data?.agents || []).length;

  const byPlatform = {};
  for (const a of all) {
    const p = PLATFORM_STYLE[a.platform] ? a.platform : 'other';
    (byPlatform[p] = byPlatform[p] || []).push(a);
  }

  return (
    <div className="flex-col gap-16">
      <div className="kpi-row">
        <div className="kpi-card"><div className="kpi-value text-accent">{all.length}</div><div className="kpi-label">Total Agents</div></div>
        <div className="kpi-card"><div className="kpi-value text-green">{onlineCount}</div><div className="kpi-label">Online</div></div>
        <div className="kpi-card"><div className="kpi-value text-red">{all.length - onlineCount}</div><div className="kpi-label">Offline</div></div>
        <div className="kpi-card"><div className="kpi-value text-amber">{Object.keys(byPlatform).length}</div><div className="kpi-label">Platforms</div></div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Network Topology — Agent Mesh</div></div>
        <div className="topology-mesh" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, padding: 16 }}>
          {Object.entries(byPlatform).map(([plat, agents]) => {
            const meta = PLATFORM_STYLE[plat] || { label: plat, icon: '\u2753', color: '#8b949e' };
            const online = agents.filter(a => onlineIds.has(a.id)).length;
            return (
              <div key={plat} className="card" style={{ margin: 0 }}>
                <div className="card-header" style={{ borderBottom: `2px solid ${meta.color}` }}>
                  <div className="card-title">{meta.icon} {meta.label} <span className="badge badge-green">{online}/{agents.length} online</span></div>
                </div>
                <div style={{ padding: '0 16px 12px', maxHeight: 320, overflow: 'auto' }}>
                  {agents.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <span style={{ color: onlineIds.has(a.id) ? 'var(--text-secondary)' : '#555' }}>
                        {onlineIds.has(a.id) ? '\u25C9' : '\u25CB'}
                      </span>
                      <span style={{ flex: 1 }}>{a.hostname || a.id}</span>
                      <code style={{ color: 'var(--text-secondary)' }}>{a.ip || '-'}</code>
                      <span className={`badge ${onlineIds.has(a.id) ? 'badge-green' : 'badge-gray'}`}>{onlineIds.has(a.id) ? 'online' : 'offline'}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}