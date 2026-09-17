import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useRefresh } from '../components/RefreshContext';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';
import { SERVER_BASE_URL, SERVER_HOST } from '../config';

const PI = { windows: '\uD83D\uFDB5', macos: '\uD83D\uFDB5', linux: '\uD83D\uDCBB', ios: '\uD83D\uDCF1', android: '\uD83D\uDCF1' };
function pi(p) { return PI[p] || '\u2753'; }
function fd(d) { if (!d) return '-'; try { return new Date(d).toLocaleString(); } catch { return d; } }

const DEPLOY_CMDS = [
  { platform: 'Windows', method: 'CMD Admin (recommended)', cmd: `cmd /c "curl -o install.cmd ${SERVER_BASE_URL}/api/agent/install/windows-batch && install.cmd"` },
  { platform: 'Windows', method: 'RMM / PowerShell', cmd: `powershell -Command "(New-Object Net.WebClient).DownloadString('${SERVER_BASE_URL}/api/agent/install/windows-oneliner') | iex"` },
  { platform: 'Windows', method: 'Standalone EXE (no Python needed)', cmd: `curl -o SOCAgent.exe ${SERVER_BASE_URL}/api/agent/download/exe && SOCAgent.exe --server ${SERVER_HOST}` },
  { platform: 'Linux', method: 'Terminal (any distro)', cmd: `curl -s ${SERVER_BASE_URL}/api/edr/install | sudo bash` },
  { platform: 'macOS', method: 'Terminal (sudo)', cmd: `curl -sL ${SERVER_BASE_URL}/api/agent/install/macos | sudo bash` },
];

export default function OurAgents() {
  const { key: rk } = useRefresh();
  const o = useApi(() => fetch('/api/agents/online').then(r => r.json()), [], rk);
  const a = useApi(() => fetch('/api/agents/all').then(r => r.json()), [], rk);
  const [f, sf] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [updating, setUpdating] = useState(false);
  const toast = useToast();

  if (o.loading || a.loading) return <LoadingSpinner />;
  if (o.error) return <ErrorState message={o.error.message} onRetry={o.refetch} />;
  if (a.error) return <ErrorState message={a.error.message} onRetry={a.refetch} />;

  const online = o.data?.agents || [];
  const all = a.data?.agents || [];
  const latest = all.reduce((m, x) => (x.latest_version && x.latest_version > m ? x.latest_version : m), '');
  const pc = {}; all.forEach(x => { pc[x.platform] = (pc[x.platform] || 0) + 1; });
  const oc = online.length, ofc = all.filter(x => x.status !== 'online').length;
  const outdated = all.filter(x => x.needs_update);
  const fl = f === 'all' ? all : f === 'online' ? online : all.filter(x => x.status === 'offline');

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === fl.length) { setSelected(new Set()); return; }
    setSelected(new Set(fl.map(x => x.id)));
  };

  const pushUpdate = async (body, label) => {
    setUpdating(true);
    try {
      const res = await fetch('/api/agents/update', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      toast(`${label}: ${d.updated} agents, ${d.failed} failed${d.skipped ? `, ${d.skipped} already current` : ''}`,
        d.failed > 0 ? 'error' : 'success');
      setSelected(new Set());
      a.refetch();
    } catch (e) { toast('Update failed', 'error'); }
    setUpdating(false);
  };

  const handleUpdate = () => {
    const ids = [...selected];
    if (ids.length === 0) { toast('No agents selected', 'info'); return; }
    pushUpdate({agent_ids: ids}, 'Update sent');
  };

  // The server decides the state (it knows whether the agent is still behind and
  // whether the request went stale), so a no-op push cannot spin forever.
  const updateChip = (x) => {
    const u = x.update || {};
    if (x.update_state === 'updating') return <span className="badge badge-amber badge-xs">updating…</span>;
    if (x.update_state === 'updated') return <span className="badge badge-green badge-xs" title={`${u.from} → ${u.to}`}>updated {u.to}</span>;
    if (x.update_state === 'failed') return <span className="badge badge-red badge-xs" title={u.error || 'failed'}>update failed</span>;
    return null;
  };

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={all.length} label="Total" color="accent" />
        <KpiCard value={oc} label="Online" color="green" />
        <KpiCard value={ofc} label="Offline" color="red" />
        <KpiCard value={outdated.length} label={latest ? `Outdated (v${latest})` : 'Outdated'} color={outdated.length ? 'amber' : 'green'} />
        {Object.entries(pc).map(([p, c]) => <KpiCard key={p} value={c} label={p} color="accent" sub={pi(p)} />)}
      </div>

      <details className="card card-mb" style={{ padding: 0 }} open={all.length === 0}>
        <summary style={{ padding: '12px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>
          &#128736; Deploy Agent — {all.length === 0 ? 'no agents yet' : 'click for commands'}
        </summary>
        <div className="flex-col gap-8" style={{ padding: '0 20px 16px' }}>
          {DEPLOY_CMDS.map((d, i) => (
            <div key={d.platform + d.method} className="text-md">
              <div className="flex gap-6 items-center" style={{ marginBottom: 2 }}>
                <span className="badge badge-accent badge-xs">{d.platform}</span>
                <span className="text-sm text-secondary">{d.method}</span>
              </div>
              <pre style={{ background: 'var(--bg)', padding: 10, borderRadius: 6, fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{d.cmd}</pre>
            </div>
          ))}
        </div>
      </details>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Our Agents ({all.length})</div>
          <div className="flex gap-8 items-center">
            <span className="filter-tab text-base" style={{ cursor: 'pointer' }} onClick={toggleSelectAll}>
              {selected.size === fl.length ? 'Deselect All' : 'Select All'}
            </span>
            {selected.size > 0 && (
              <button className="btn btn-sm btn-primary" disabled={updating} onClick={handleUpdate}>
                {updating ? 'Updating...' : `Update (${selected.size})`}
              </button>
            )}
            {outdated.length > 0 && (
              <button className="btn btn-sm" disabled={updating}
                onClick={() => pushUpdate({outdated: true}, 'Updating outdated')}>
                Update outdated ({outdated.length})
              </button>
            )}
            <div className="filter-tabs" style={{ margin: 0 }}>
              <span className={`filter-tab ${f === 'all' ? 'active' : ''}`} onClick={() => sf('all')}>All</span>
              <span className={`filter-tab ${f === 'online' ? 'active' : ''}`} onClick={() => sf('online')}>Online ({oc})</span>
              <span className={`filter-tab ${f === 'offline' ? 'active' : ''}`} onClick={() => sf('offline')}>Offline ({ofc})</span>
            </div>
          </div>
        </div>
        {fl.length === 0 ? (
          <div className="empty-state">No agents match this filter.</div>
        ) : (
          <div className="table-container" style={{ maxHeight: 500, overflow: 'auto' }}>
            <table>
              <thead><tr className="th-sticky">
                <th style={{ width: 30 }}></th>
                <th>Platform</th><th>Hostname</th><th>Version</th><th>Status</th><th>Last Seen</th><th>Update</th>
              </tr></thead>
              <tbody>
                {fl.map((x, i) => (
                  <tr key={x.id} style={{ cursor: 'pointer', opacity: x.status === 'offline' ? 0.6 : 1 }}
                    onClick={() => toggleSelect(x.id)}>
                    <td>
                      <input type="checkbox" checked={selected.has(x.id)} onChange={e => { e.stopPropagation(); toggleSelect(x.id); }} />
                    </td>
                    <td style={{ fontSize: 16 }} title={x.platform}>{pi(x.platform)}</td>
                    <td style={{ fontWeight: 600 }}>{x.hostname}</td>
                    <td className="text-sm text-secondary">
                      {x.version}
                      {x.needs_update && x.latest_version && (
                        <span className="badge badge-amber badge-xs" style={{ marginLeft: 6 }}
                          title={`latest is ${x.latest_version}`}>→ {x.latest_version}</span>
                      )}
                      {updateChip(x) && <span style={{ marginLeft: 6 }}>{updateChip(x)}</span>}
                    </td>
                    <td><span className={`badge ${x.status === 'online' ? 'badge-green' : 'badge-gray'}`}>{x.status}</span></td>
                    <td className="text-sm text-secondary">{fd(x.last_seen)}</td>
                    <td>
                      {x.needs_update && (
                        <button className="btn btn-xs" disabled={updating}
                          onClick={e => { e.stopPropagation(); pushUpdate({agent_ids: [x.id]}, `Updating ${x.hostname}`); }}>
                          Update
                        </button>
                      )}
                    </td>
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
