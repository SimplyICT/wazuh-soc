import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useRefresh } from '../components/RefreshContext';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function severityBadgeClass(severity) {
  if (severity === 'critical') return 'badge-red';
  if (severity === 'high') return 'badge-amber';
  return 'badge-gray';
}
function changeTypeBadgeClass(type) {
  if (type === 'deleted') return 'badge-red';
  if (type === 'created') return 'badge-green';
  return 'badge-amber';
}
function timeAgo(d) {
  if (!d) return '-'; const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return Math.floor(s/60)+'m'; return Math.floor(s/3600)+'h';
}

export default function Fim() {
  const { key: rk } = useRefresh();
  const s = useApi(() => fetch('/api/fim/summary').then(r => r.json()), [], rk);
  const evR = useApi(() => fetch('/api/fim/events?limit=100').then(r => r.json()), [], rk);
  const cfgR = useApi(() => fetch('/api/fim/config?platform=linux').then(r => r.json()), [], rk);
  const toast = useToast();
  const [tab, setTab] = useState('events');
  const [newPath, setNewPath] = useState({ path: '', severity: 'medium', type: 'custom' });

  if (s.loading || evR.loading || cfgR.loading) return <LoadingSpinner />;
  if (s.error) return <ErrorState message={s.error.message} onRetry={s.refetch} />;

  const d = s.data || {};
  const events = evR.data?.events || [];
  const paths = cfgR.data?.paths || [];

  const handleAgentScan = async () => {
    try {
      toast('Scanning online agents for file changes...', 'info');
      const res = await fetch('/api/fim/scan', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      toast(`Queued FIM scan on ${d.queued || 0} online agents`, 'success');
      setTimeout(() => { evR.refetch(); s.refetch(); }, 8000);
    } catch (e) {
      toast(`FIM scan failed: ${e.message}`, 'error');
    }
  };

  const handleDeletePath = async (path) => {
    if (!confirm('Remove this watched path?')) return;
    try {
      const res = await fetch(`/api/fim/config/linux/${encodeURIComponent(path)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast('Removed', 'success'); cfgR.refetch();
    } catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
  };

  const handleTogglePath = async (path, enabled) => {
    try {
      const res = await fetch(`/api/fim/config/linux/${encodeURIComponent(path)}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({enabled: !enabled}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cfgR.refetch();
    } catch (e) { toast(`Toggle failed: ${e.message}`, 'error'); }
  };
  const handleAddPath = async () => {
    if (!newPath.path.trim()) return;
    try {
      const res = await fetch('/api/fim/config/linux', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(newPath),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast('Path added', 'success');
      setNewPath({ path: '', severity: 'medium', type: 'custom' });
      cfgR.refetch();
    } catch (e) { toast(`Add failed: ${e.message}`, 'error'); }
  };

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={d.total_changes || 0} label="File Changes" color="accent" />
        <KpiCard value={d.by_severity?.critical || 0} label="Critical" color="red" />
        <KpiCard value={d.by_severity?.high || 0} label="High" color="amber" />
        <KpiCard value={d.watched_paths || 0} label="Watched Paths" color="green" />
        <KpiCard value={d.by_change_type?.modified || 0} label="Modified" color="accent" />
        <KpiCard value={d.by_change_type?.created || 0} label="Created" color="green" />
      </div>

      <div className="tabs">
        <span className={`tab ${tab === 'events' ? 'active' : ''}`} onClick={() => setTab('events')}>Change Log ({events.length})</span>
        <span className={`tab ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>Watched Paths ({paths.length})</span>
      </div>

      {tab === 'events' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent File Changes</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-primary" onClick={handleAgentScan}>Scan Agents</button>
              <button className="btn btn-sm" onClick={() => evR.refetch()}>&#8635;</button>
            </div>
          </div>
          {events.length === 0 ? (
            <div className="empty-state">
              No file changes detected. Deploy the agent and configure watched paths.
              <p className="text-base text-secondary" style={{ marginTop: 8 }}>
                Agent 004 (ITFlow) will scan on the next FIM command.
              </p>
            </div>
          ) : (
            <div className="table-container" style={{ maxHeight: 500, overflow: 'auto' }}>
              <table>
                <thead><tr className="th-sticky">
                  <th>Time</th><th>Agent</th><th>Type</th><th>Severity</th><th>File</th>
                </tr></thead>
                <tbody>
                  {events.map((ev, i) => (
                    <tr key={ev.filepath + ev.timestamp}>
                      <td className="text-sm text-nowrap">{timeAgo(ev.timestamp)}</td>
                      <td className="text-sm">{ev.hostname || ev.agent_id || '-'}</td>
                      <td><span className={`badge badge-xs ${changeTypeBadgeClass(ev.change_type)}`}>{ev.change_type}</span></td>
                      <td><span className={`badge badge-xs ${severityBadgeClass(ev.severity)}`}>{ev.severity}</span></td>
                      <td className="text-base text-mono truncate-sm">{ev.filepath}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'config' && (
        <div className="card">
          <div className="card-header"><div className="card-title">Watched Paths (Linux)</div></div>

          <div className="flex gap-8" style={{ marginBottom: 16, alignItems: 'end' }}>
            <div className="flex-1">
              <label className="label">Path</label>
              <input value={newPath.path} onChange={e => setNewPath(p => ({...p, path: e.target.value}))}
                placeholder="/etc/ssh/sshd_config"
                className="input" style={{ width: '100%' }} />
            </div>
            <div style={{ width: 100 }}>
              <label className="label">Severity</label>
              <select value={newPath.severity} onChange={e => setNewPath(p => ({...p, severity: e.target.value}))}
                className="select" style={{ width: '100%' }}>
                <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option>
              </select>
            </div>
            <button className="btn btn-sm btn-primary" onClick={handleAddPath} disabled={!newPath.path.trim()}>Add</button>
          </div>

          <table>
            <thead><tr><th>Path</th><th>Type</th><th>Severity</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {paths.map((p, i) => (
                <tr key={p.path} style={{ opacity: p.enabled === false ? 0.5 : 1 }}>
                  <td className="text-mono text-base truncate">{p.path}</td>
                  <td><span className="badge badge-gray badge-xs">{p.type}</span></td>
                  <td><span className={`badge badge-xs ${severityBadgeClass(p.severity)}`}>{p.severity}</span></td>
                  <td>
                    <span className={`badge badge-click ${p.enabled !== false ? 'badge-green' : 'badge-gray'}`}
                      onClick={() => handleTogglePath(p.path, p.enabled)}>{p.enabled !== false ? 'Watch' : 'Paused'}</span>
                  </td>
                  <td><button className="btn btn-sm btn-danger btn-xs" onClick={() => handleDeletePath(p.path)}>X</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
