import { useApi } from '../hooks/useApi';
import { useRefresh } from '../components/RefreshContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
function severityBadgeClass(severity) {
  if (severity === 'critical') return 'badge-red';
  if (severity === 'high') return 'badge-amber';
  if (severity === 'medium') return 'badge-amber';
  if (severity === 'low') return 'badge-gray';
  return 'badge-gray';
}

function Kpi({ value, label, sub, color }) {
  return (
    <div className="kpi-card" style={{ borderTop: `2px solid ${color || 'var(--accent)'}` }}>
      <div className="kpi-value" style={{ color: color || 'var(--accent)', fontSize: 28 }}>{value ?? '-'}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="text-xs text-secondary" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function timeAgo(d) {
  if (!d) return '-';
  const sec = (Date.now() - new Date(d).getTime()) / 1000;
  if (sec < 60) return 'now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h';
  return Math.floor(sec / 86400) + 'd';
}

export default function Dashboard() {
  const { key: rk } = useRefresh();
  const r = useApi(() => fetch('/api/dashboard').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }), [], rk);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const d = r.data || {};
  const agents = d.agents || {};
  const itdr = d.itdr || {};
  const siem = d.siem || {};
  const queue = d.queue || {};
  const detections = d.detections || [];
  const byPlat = agents.by_platform || {};

  const critical = (itdr.critical || 0) + (queue.by_severity?.critical || 0);
  const high = (itdr.high || 0) + (queue.by_severity?.high || 0);

  return (
    <div className="dashboard">
      {/* ── KPI Row ── */}
      <div className="kpi-row" style={{ marginBottom: 0 }}>
        <Kpi value={agents.online || 0} label="Agents Online" sub={`${agents.total || 0} total`} color="#00ff88" />
        <Kpi value={agents.offline || 0} label="Offline" sub={`${Object.keys(byPlat).length} platforms`} color="#ff4757" />
        <Kpi value={critical} label="Critical Alerts" sub="requires action" color="#ff4757" />
        <Kpi value={high} label="High Alerts" sub="needs review" color="#ff9500" />
        <Kpi value={itdr.total_events || 0} label="Identity Events" sub={itdr.sources_configured ? 'M365 connected' : 'not configured'} color="#00b4d8" />
        <Kpi value={siem.total_logs || 0} label="SIEM Logs" sub={`${Object.keys(siem.by_source || {}).length} sources`} color="#8fa6b5" />
      </div>

      <div className="cols-2 card-mt">
        {/* ── Agent Platform Breakdown ── */}
        <div className="card">
          <div className="card-header"><div className="card-title">Agent Platforms</div></div>
          <div className="flex-col gap-8">
            {Object.entries(byPlat).length === 0 ? (
              <div className="empty-state">No agents deployed</div>
            ) : (
              Object.entries(byPlat).map(([plat, count]) => {
                const pct = agents.total ? Math.round(count / agents.total * 100) : 0;
                const icon = plat === 'windows' ? '\uD83D\uFDB5' : plat === 'linux' ? '\uD83D\uDCBB' : plat === 'macos' ? '\uD83D\uFDB5' : '\u2753';
                return (
                  <div key={plat}>
                    <div className="flex justify-between" style={{ fontSize: 13, marginBottom: 2 }}>
                      <span>{icon} {plat.charAt(0).toUpperCase() + plat.slice(1)}</span>
                      <span style={{ fontWeight: 600 }}>{count}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: plat === 'windows' ? '#00b4d8' : plat === 'linux' ? '#00ff88' : '#8fa6b5', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })
            )}
            <div className="text-base text-secondary" style={{ marginTop: 8 }}>
              {agents.online || 0} online &middot; {agents.offline || 0} offline &middot; {d.detection_count || 0} active detections
            </div>
          </div>
        </div>

        {/* ── Security Overview ── */}
        <div className="card">
          <div className="card-header"><div className="card-title">Security Overview</div></div>
          <div className="flex-col gap-10">
            <div className="flex justify-between items-center">
              <span className="text-md">SOC Queue</span>
              <span style={{ fontWeight: 600, color: 'var(--amber)' }}>{queue.total || 0} items</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-md">Unassigned</span>
              <span style={{ fontWeight: 600, color: 'var(--red)' }}>{queue.unassigned || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-md">SLA Breached</span>
              <span style={{ fontWeight: 600, color: queue.sla_breached > 0 ? 'var(--red)' : 'var(--green)' }}>
                {queue.sla_breached || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-md">Detection Rules</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{d.detection_count || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-md">SIEM Sources</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{Object.keys(siem.by_source || {}).length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-md">ITDR Events (72h)</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{itdr.total_events || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Detections ── */}
      <div className="card card-mt">
        <div className="card-header">
          <div className="card-title">Recent Detections ({detections.length})</div>
          <a className="btn btn-sm text-sm" href="#/itdr">View All</a>
        </div>
        {detections.length === 0 ? (
          <div className="empty-state">No recent detections. All clear.</div>
        ) : (
          <div className="table-container" style={{ maxHeight: 300, overflow: 'auto' }}>
            <table>
              <thead><tr className="th-sticky">
                <th>Severity</th><th>Detection</th><th>User</th><th>Time</th>
              </tr></thead>
              <tbody>
                {detections.map((det, i) => (
                  <tr key={det.timestamp + det.title}>
                    <td><span className={`badge badge-xs ${severityBadgeClass(det.severity)}`}>{det.severity}</span></td>
                    <td className="text-base truncate">{det.title || det.detection_name || '-'}</td>
                    <td className="text-sm">{det.user || '-'}</td>
                    <td className="text-sm text-secondary">{timeAgo(det.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Activity Timeline ── */}
      <div className="card card-mt">
        <div className="card-header"><div className="card-title">SOC Activity</div></div>
        <div className="flex-col gap-6" style={{ fontSize: 13 }}>
          {agents.online > 0 && (
            <div className="flex gap-8 items-center">
              <span className="text-green">&#9679;</span>
              <span>{agents.online} agent{agents.online > 1 ? 's' : ''} connected</span>
              <span className="text-sm text-secondary">WebSocket</span>
            </div>
          )}
          {siem.total_logs > 0 && (
            <div className="flex gap-8 items-center">
              <span className="text-accent">&#9679;</span>
              <span>{siem.total_logs} SIEM log{siem.total_logs > 1 ? 's' : ''} ingested</span>
              <span className="text-sm text-secondary">{Object.keys(siem.by_source || {}).length} sources</span>
            </div>
          )}
          {itdr.total_events > 0 && (
            <div className="flex gap-8 items-center">
              <span className="text-amber">&#9679;</span>
              <span>{itdr.total_events} identity events monitored</span>
              <span className="text-sm text-secondary">M365 Graph API</span>
            </div>
          )}
          {d.detection_count > 0 && (
            <div className="flex gap-8 items-center">
              <span className="text-red">&#9679;</span>
              <span>{d.detection_count} detection{d.detection_count > 1 ? 's' : ''} active</span>
              <span className="text-sm text-secondary">ITDR rules</span>
            </div>
          )}
          {queue.total > 0 && (
            <div className="flex gap-8 items-center">
              <span className="text-amber">&#9679;</span>
              <span>{queue.total} items in SOC queue</span>
              <span className="text-sm text-secondary">{queue.unassigned} unassigned</span>
            </div>
          )}
          {agents.total > 0 && (
            <div className="flex gap-8 items-center">
              <span className="text-green">&#9679;</span>
              <span>{agents.total} agent{agents.total > 1 ? 's' : ''} registered</span>
              <span className="text-sm text-secondary">
                {Object.entries(byPlat).map(([p, c]) => `${p}: ${c}`).join(' | ')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
