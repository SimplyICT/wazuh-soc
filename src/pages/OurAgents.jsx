import { Fragment, useState } from 'react';
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

// Per-host response: the action catalogue (/api/agent/respond/actions) is the only source of
// actions and their parameters. These two maps exist solely to decide how loudly the UI warns,
// because the server contract carries no destructive/confirm flag.
const DESTRUCTIVE_ACTIONS = new Set(['kill', 'isolate', 'quarantine']);

function isDestructive(name, args) {
  if (DESTRUCTIVE_ACTIONS.has(name)) return true;
  return name === 'service' && (args.action === 'stop' || args.action === 'disable');
}

// Card-status vocabulary of /api/agent/responses: the joined command row decides it.
const RESPONSE_STATUS = {
  done: ['badge-green', 'done'],
  pending: ['badge-amber', 'pending'],
  sent: ['badge-amber', 'sent'],
  error: ['badge-red', 'failed'],
  failed: ['badge-red', 'failed'],
};

// One-line gist of the agent's result dict; the untruncated JSON stays in the cell tooltip.
function resultSummary(r) {
  if (r == null) return '';
  if (typeof r === 'string') return r;
  if (r.error) return `error: ${r.error}`;
  for (const k of ['detail', 'quarantined_to', 'stdout_tail', 'stderr_tail', 'name']) {
    if (r[k]) return String(r[k]);
  }
  try { return JSON.stringify(r); } catch { return ''; }
}

// POST /api/agent/{id}/respond answers `delivered: true` when the command went out on the live
// WebSocket, false when it waits for the agent's next poll/reconnect.
function deliveryLabel(d) {
  return d.delivered === true ? 'delivered now' : 'queued for the next check-in';
}

function RespondPanel({ agent, actions, catalogueError, onDone }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [vals, setVals] = useState({});
  const [comment, setComment] = useState('');
  const [caseId, setCaseId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const spec = actions[name] || null;
  const allParams = Object.entries(spec?.params || {});
  // run_script's confirm flag is the acknowledgement checkbox below, so it must not render twice.
  const params = allParams.filter(([k]) => !(name === 'run_script' && k === 'confirm'));
  const isScript = name === 'run_script';
  const acked = vals.confirm === true;
  const missing = params.filter(([k, p]) => p.required && (vals[k] === undefined || vals[k] === '')).map(([k, p]) => p.label || k);

  const pick = (k, v) => { setVals(prev => ({ ...prev, [k]: v })); setConfirming(false); };

  const buildArgs = () => {
    const out = {};
    for (const [k, p] of params) {
      const v = vals[k];
      if (p.type === 'bool') { out[k] = v === true; continue; }
      if (v === undefined || v === '') continue;  // leave the server's own default in place
      out[k] = p.type === 'int' ? Number(v) : v;
    }
    if (isScript) out.confirm = acked;  // the agent refuses run_script without it
    return out;
  };

  const canSend = !!name && missing.length === 0 && !(isScript && !acked) && !busy;

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(agent.id)}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: name, args: buildArgs(), comment, case_id: caseId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) throw new Error(d.error || `HTTP ${res.status}`);
      toast(`${spec?.label || name} → ${agent.hostname}: ${deliveryLabel(d)}`, 'success');
      setConfirming(false); setName(''); setVals({}); setComment(''); setCaseId('');
      onDone();
    } catch (e) {
      toast(`Response failed: ${e.message}`, 'error');
    }
    setBusy(false);
  };

  const destructive = isDestructive(name, buildArgs());
  const label = spec?.label || name;

  if (Object.keys(actions).length === 0) {
    return (
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }} className="text-sm text-secondary">
        {catalogueError
          ? `Could not load the response action catalogue — no action can be sent to ${agent.hostname} right now.`
          : `The server published no response actions for ${agent.hostname}.`}
      </div>
    );
  }

  return (
    <div className="flex-col gap-8" style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div className="flex gap-8 items-center flex-wrap">
        <span className="text-base" style={{ fontWeight: 600 }}>Respond on {agent.hostname}</span>
        <span className="text-sm text-secondary">{agent.platform} · {agent.status}</span>
      </div>

      <div>
        <label className="label">Action</label>
        <select className="select select-sm" value={name}
          onChange={e => { setName(e.target.value); setVals({}); setConfirming(false); }}>
          <option value="">Select action…</option>
          {Object.entries(actions).map(([n, s]) => <option key={n} value={n}>{s.label || n}</option>)}
        </select>
        {spec?.description && <div className="text-sm text-secondary" style={{ marginTop: 4 }}>{spec.description}</div>}
      </div>

      {spec && params.length > 0 && (
        <div className="flex-col gap-8">
          {params.map(([k, p]) => (
            <div key={k}>
              <label className="label">{p.label || k}{p.required ? ' *' : ''}</label>
              {p.options ? (
                <select className="select select-sm" value={vals[k] ?? ''} onChange={e => pick(k, e.target.value)}>
                  <option value="">—</option>
                  {p.options.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              ) : p.type === 'textarea' ? (
                <textarea className="input" rows={k === 'script' ? 6 : 3} style={{ width: '100%', fontFamily: 'monospace' }}
                  value={vals[k] ?? ''} onChange={e => pick(k, e.target.value)} />
              ) : p.type === 'bool' ? (
                <input type="checkbox" checked={vals[k] === true}
                  onChange={e => pick(k, e.target.checked)} />
              ) : (
                <input className="input input-sm" type={p.type === 'int' ? 'number' : 'text'}
                  value={vals[k] ?? ''} onChange={e => pick(k, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      )}

      {isScript && (
        <div className="text-sm" style={{ padding: 10, border: '1px solid var(--amber)', borderRadius: 6 }}>
          <b style={{ color: 'var(--amber)' }}>&#9888; run_script executes this script as SYSTEM (Windows) / root (Linux) on {agent.hostname}.</b>
          <div className="text-sm text-secondary" style={{ marginTop: 4 }}>
            Only run code you have reviewed. It runs once and the temp file is deleted afterwards; stdout/stderr come back truncated.
          </div>
          <label className="flex gap-6 items-center" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={acked} onChange={e => pick('confirm', e.target.checked)} />
            <span className="text-sm text-secondary">I have reviewed this script — set args.confirm = true</span>
          </label>
        </div>
      )}

      {spec && (
        <div className="flex gap-8 flex-wrap">
          <div style={{ minWidth: 240, flex: 1 }}>
            <label className="label">Comment (optional)</label>
            <input className="input input-sm" style={{ width: '100%' }} value={comment}
              placeholder="Why this action is being run" onChange={e => setComment(e.target.value)} />
          </div>
          <div style={{ minWidth: 240, flex: 1 }}>
            <label className="label">Finding (case/queue id) — optional</label>
            <input className="input input-sm" style={{ width: '100%' }} value={caseId}
              placeholder="links the action to a finding" onChange={e => setCaseId(e.target.value)} />
          </div>
        </div>
      )}

      {missing.length > 0 && <div className="text-sm" style={{ color: 'var(--red)' }}>Required: {missing.join(', ')}</div>}

      {spec && !confirming && (
        <div className="flex gap-8 items-center">
          <button className="btn btn-sm btn-primary" disabled={!canSend} onClick={() => setConfirming(true)}>Send to host</button>
          <span className="text-sm text-secondary">{isScript && !acked ? 'tick the acknowledgement above to enable' : ''}</span>
        </div>
      )}

      {spec && confirming && (
        <div className="flex gap-8 items-center flex-wrap">
          <span className={`text-sm ${destructive ? 'text-red' : 'text-secondary'}`}>
            {destructive
              ? `Destructive: ${label} on ${agent.hostname}?`
              : `${label} on ${agent.hostname}?`}
          </span>
          <button className={`btn btn-sm ${destructive ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={send}>
            {busy ? 'Sending…' : destructive ? `Yes, run ${name}` : 'Confirm'}
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default function OurAgents() {
  const { key: rk } = useRefresh();
  const o = useApi(() => fetch('/api/agents/online').then(r => r.json()), [], rk);
  const a = useApi(() => fetch('/api/agents/all').then(r => r.json()), [], rk);
  const nh = useApi(() => fetch('/api/agents/needs-hands').then(r => r.json()), [], rk);
  // The action catalogue and the audit trail are page-wide, so they load once here rather than
  // per row; a row only tracks whether its inline panel is open.
  const cat = useApi(() => fetch('/api/agent/respond/actions').then(r => r.json()), [], rk);
  const hist = useApi(() => fetch('/api/agent/responses?limit=20').then(r => r.json()), [], rk);
  const [f, sf] = useState('all');
  const [responding, setResponding] = useState('');
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
  const needsHands = nh.data?.items || [];
  const fl = f === 'all' ? all : f === 'online' ? online : all.filter(x => x.status === 'offline');
  const actions = cat.data || {};
  const responses = hist.data?.responses || [];
  const hostOf = Object.fromEntries(all.map(x => [x.id, x.hostname]));

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
      <div className="card card-mb">
        <div className="card-header">
          <div className="card-title">
            Needs hands ({needsHands.length})
            <span className={`badge ${needsHands.length ? 'badge-amber' : 'badge-green'}`} style={{ marginLeft: 8 }}>
              {needsHands.length ? 'blocked' : 'clear'}
            </span>
          </div>
          <span className="text-sm text-secondary">
            {needsHands.length
              ? `automatic convergence cannot fix these${nh.data?.generated_at ? ` (checked ${fd(nh.data.generated_at)})` : ''} · published ${nh.data?.published?.script || '?'}`
              : 'every host is current or reachable — nothing needs a human'}
          </span>
        </div>
        {needsHands.length > 0 && (
          <table>
            <thead><tr>
              <th>Host</th><th>Reported</th><th>Last seen</th><th>Why it cannot be auto-fixed</th>
            </tr></thead>
            <tbody>
              {needsHands.map(it => (
                <tr key={it.host}>
                  <td className="text-base">{it.host}
                    {it.platform && <div className="text-sm text-secondary">{it.platform}{it.build ? ` · ${it.build}` : ''}</div>}
                  </td>
                  <td className="text-sm">
                    <span className="badge badge-amber">v{it.reported_version || '?'}</span>
                    {it.latest_version && String(it.reported_version) !== String(it.latest_version) &&
                      <span className="text-sm text-secondary"> → {it.latest_version}</span>}
                  </td>
                  <td className="text-sm text-nowrap">
                    {it.online ? <span className="badge badge-green">online</span> : (it.last_seen ? fd(it.last_seen) : 'never')}
                  </td>
                  <td className="text-sm">
                    <b>{it.status === 'STUCK' ? 'installer ineffective' : 'RMM agent unreachable'}</b>
                    <div className="text-sm text-secondary" style={{ whiteSpace: 'pre-wrap' }}>{it.reason}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {needsHands.length > 0 && (
          <div className="text-sm text-secondary" style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
            A stuck host keeps its old agent version until the installer can run there — check network egress to the
            collector ({nh.data?.collector || SERVER_HOST}) and endpoint security, then re-run <code>trmm-converge-agents.py --host &lt;name&gt;</code>.
          </div>
        )}
      </div>

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
                <th>Platform</th><th>Hostname</th><th>Version</th><th>Status</th><th>Last Seen</th><th>Update</th><th>Response</th>
              </tr></thead>
              <tbody>
                {fl.map((x, i) => (
                  <Fragment key={x.id}>
                  <tr style={{ cursor: 'pointer', opacity: x.status === 'offline' ? 0.6 : 1 }}
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
                    <td>
                      <button className="btn btn-xs"
                        onClick={e => { e.stopPropagation(); setResponding(responding === x.id ? '' : x.id); }}>
                        {responding === x.id ? 'Close' : 'Respond'}
                      </button>
                    </td>
                  </tr>
                  {responding === x.id && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0 }}>
                        <RespondPanel agent={x} actions={actions} catalogueError={!!cat.error}
                          onDone={() => hist.refetch()} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-mt">
        <div className="card-header">
          <div className="card-title">Recent responses ({responses.length})</div>
          <button className="btn btn-sm" onClick={() => hist.refetch()} title="Reload the response history">&#8635;</button>
        </div>
        {hist.loading ? (
          <div className="loading">Loading response history…</div>
        ) : responses.length === 0 ? (
          <div className="empty-state">
            No response action has been run yet. Pick <b>Respond</b> on an agent row — the result lands here,
            attributed to that host and to the analyst who ran it.
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: 360, overflow: 'auto' }}>
            <table>
              <thead><tr className="th-sticky">
                <th>Time</th><th>Host</th><th>Action</th><th>Actor</th><th>Status</th><th>Finding</th><th>Result</th>
              </tr></thead>
              <tbody>
                {responses.map(r => {
                  const [cls, text] = RESPONSE_STATUS[r.status] || ['badge-gray', r.status || 'unknown'];
                  const raw = r.result == null ? '' : (typeof r.result === 'string' ? r.result : JSON.stringify(r.result));
                  const summary = resultSummary(r.result);
                  return (
                    <tr key={r.id || r.cmd_id}>
                      <td className="text-sm text-secondary text-nowrap">{fd(r.created)}</td>
                      <td className="text-base">{hostOf[r.agent_id] || r.agent_id}</td>
                      <td className="text-base">{r.action}</td>
                      <td className="text-sm text-secondary">{r.actor || '—'}</td>
                      <td><span className={`badge ${cls} badge-xs`} title={r.status}>{text}</span></td>
                      <td className="text-sm">
                        {r.case_id || r.queue_id
                          ? <span className="badge badge-accent badge-xs">{r.case_id || r.queue_id}</span>
                          : <span className="text-secondary">—</span>}
                      </td>
                      <td className="text-sm" style={{ maxWidth: 320 }}>
                        <span className="truncate-sm" style={{ display: 'inline-block', verticalAlign: 'bottom' }}
                          title={raw}>{summary || '—'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-sm text-secondary" style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
          Isolation blocks traffic in <b>both</b> directions (only the collector link keeps working), so release it as
          soon as the host is triaged. <code>run_script</code> runs as SYSTEM / root and refuses to start without its
          confirm flag.
        </div>
      </div>
    </>
  );
}
