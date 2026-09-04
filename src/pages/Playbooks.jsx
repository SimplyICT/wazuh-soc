import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SOURCES = ['edr', 'itdr', 'siem', 'windows_eventlog'];

function fmtTime(d) { if (!d) return '-'; try { return new Date(d).toLocaleString(); } catch { return d; } }

function PlaybookEditor({ playbook, actions, onSave, onCancel }) {
  const [form, setForm] = useState(playbook || {
    name: '', enabled: true, auto_trigger: true,
    trigger: { severity: ['critical'], sources: [] },
    conditions: [], actions: [],
  });

  const addAction = (type) => {
    const def = actions[type];
    const params = {};
    if (def?.params) { for (const [k] of Object.entries(def.params)) params[k] = ''; }
    setForm(f => ({ ...f, actions: [...f.actions, { type, params }] }));
  };
  const removeAction = (idx) => setForm(f => ({ ...f, actions: f.actions.filter((_, i) => i !== idx) }));
  const updateParam = (idx, k, v) => setForm(f => {
    const a = [...f.actions]; a[idx] = { ...a[idx], params: { ...a[idx].params, [k]: v } };
    return { ...f, actions: a };
  });

  return (
    <div className="card card-mt">
      <div className="card-header">
        <div className="card-title">{playbook ? `Edit: ${playbook.name}` : 'New Playbook'}</div>
        <div className="flex gap-6">
          <button className="btn btn-sm" onClick={() => onSave({ ...form, auto_trigger: !form.auto_trigger })}>
            {form.auto_trigger ? 'Auto: ON' : 'Auto: OFF'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => onSave(form)}>Save</button>
          <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <div className="flex-col gap-10">
        <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
          placeholder="Playbook name" className="input" style={{ width: '100%' }} />

        <div><label className="label">Trigger Severity</label>
          <div className="flex gap-4" style={{ marginTop: 2 }}>
            {SEVERITIES.map(s => (
              <span key={s} className={`filter-tab ${(form.trigger?.severity || []).includes(s) ? 'active' : ''} text-base`}
                onClick={() => { const sev = form.trigger?.severity || []; setForm(f => ({...f, trigger: {...f.trigger, severity: sev.includes(s) ? sev.filter(x => x !== s) : [...sev, s]}})); }}
                style={{ cursor: 'pointer' }}>{s}</span>
            ))}
          </div>
        </div>

        <div><label className="label">Trigger Source</label>
          <div className="flex gap-4 flex-wrap" style={{ marginTop: 2 }}>
            {SOURCES.map(s => (
              <span key={s} className={`filter-tab ${(form.trigger?.sources || []).includes(s) ? 'active' : ''} text-base`}
                onClick={() => { const src = form.trigger?.sources || []; setForm(f => ({...f, trigger: {...f.trigger, sources: src.includes(s) ? src.filter(x => x !== s) : [...src, s]}})); }}
                style={{ cursor: 'pointer' }}>{s}</span>
            ))}
          </div>
        </div>

        <div><label className="label">Actions ({form.actions.length})</label>
          {form.actions.map((a, i) => (
            <div key={a.type + i} style={{ padding: 8, background: 'var(--bg)', borderRadius: 6, marginTop: 4 }}>
              <div className="flex justify-between" style={{ marginBottom: 4 }}>
                <span className="badge badge-accent badge-xs">{a.type}</span>
                <span className="text-sm text-red" style={{ cursor: 'pointer' }} onClick={() => removeAction(i)}>Remove</span>
              </div>
              {actions[a.type]?.params && Object.entries(actions[a.type].params).map(([k, v]) => (
                v.type === 'textarea'
                  ? <textarea key={k} value={a.params?.[k] || ''} onChange={e => updateParam(i, k, e.target.value)} rows={2}
                      className="input-sm" style={{ resize: 'vertical', marginTop: 2 }} />
                  : <input key={k} value={a.params?.[k] || ''} onChange={e => updateParam(i, k, e.target.value)}
                      className="input-sm" style={{ marginTop: 2 }} />
              ))}
            </div>
          ))}
          <div className="flex flex-wrap gap-4" style={{ marginTop: 6 }}>
            {Object.entries(actions).map(([k, v]) => (
              <span key={k} className="filter-tab text-xs" style={{ cursor: 'pointer' }} onClick={() => addAction(k)}>{v.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Playbooks() {
  const r = useApi(() => fetch('/api/playbooks').then(r => r.json()), []);
  const auditR = useApi(() => fetch('/api/playbooks/audit').then(r => r.json()), []);
  const actionsR = useApi(() => fetch('/api/playbooks/actions').then(r => r.json()), []);
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState('list');

  if (r.loading || actionsR.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const pbs = r.data?.playbooks || [];
  const actions = actionsR.data?.actions || {};
  const audit = auditR.data?.log || [];
  const stats = auditR.data?.stats || {};

  const handleSave = async (form) => {
    const isNew = !form.id;
    try {
      const res = await fetch(isNew ? '/api/playbooks' : `/api/playbooks/${form.id}`, {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast(isNew ? 'Created' : 'Updated', 'success'); setShowNew(false); setEditing(null); r.refetch();
    } catch (e) {
      toast(`Save failed: ${e.message}`, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete?')) return;
    try {
      const res = await fetch(`/api/playbooks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast('Deleted', 'success'); r.refetch();
    } catch (e) {
      toast(`Delete failed: ${e.message}`, 'error');
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await fetch(`/api/playbooks/${id}/toggle`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      r.refetch();
    } catch (e) {
      toast(`Toggle failed: ${e.message}`, 'error');
    }
  };

  const handleAutoTrigger = async (pb) => {
    try {
      const res = await fetch(`/api/playbooks/${pb.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pb, auto_trigger: !pb.auto_trigger }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      r.refetch();
    } catch (e) {
      toast(`Update failed: ${e.message}`, 'error');
    }
  };


  return (
    <>
      <div className="kpi-row">
        <KpiCard value={pbs.length} label="Playbooks" color="accent" />
        <KpiCard value={pbs.filter(p => p.enabled).length} label="Enabled" color="green" />
        <KpiCard value={pbs.filter(p => p.auto_trigger).length} label="Auto-Trigger" color="amber" />
        <KpiCard value={stats.total_executions || 0} label="Executions" color="accent" />
        <KpiCard value={stats.triggered || 0} label="Triggered" color="green" />
      </div>

      <div className="tabs">
        <span className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>Playbooks ({pbs.length})</span>
        <span className={`tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => { setTab('audit'); auditR.refetch(); }}>Audit Log ({audit.length})</span>
      </div>

      {tab === 'list' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Automation Playbooks</div>
            <button className="btn btn-sm btn-primary" onClick={() => { setShowNew(true); setEditing(null); }}>+ New</button>
          </div>
          {(showNew || editing) && (
            <PlaybookEditor playbook={editing} actions={actions} onSave={handleSave}
              onCancel={() => { setShowNew(false); setEditing(null); }} />
          )}
          {pbs.length === 0 ? (
            <div className="empty-state">No playbooks yet. Create one to automate response actions.</div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Trigger</th><th>Actions</th><th>Auto</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {pbs.map((pb, i) => (
                  <tr key={pb.id} style={{ opacity: pb.enabled ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{pb.name}</td>
                    <td className="text-base">
                      {(pb.trigger?.severity || []).map(s => <span key={s} className={`badge ${s === 'critical' ? 'badge-red' : s === 'high' ? 'badge-amber' : 'badge-gray'} badge-xs`} style={{ fontSize: 9 }}>{s}</span>)}
                      {(pb.trigger?.sources || []).map(s => <span key={s} className="badge badge-accent badge-xs" style={{ fontSize: 9 }}>{s}</span>)}
                    </td>
                    <td className="text-sm">{(pb.actions || []).map(a => a.type).join(', ')}</td>
                    <td>
                      <span className={`badge badge-click ${pb.auto_trigger !== false ? 'badge-green' : 'badge-gray'}`}
                        onClick={() => handleAutoTrigger(pb)}>{pb.auto_trigger !== false ? 'On' : 'Off'}</span>
                    </td>
                    <td>
                      <span className={`badge badge-click ${pb.enabled ? 'badge-green' : 'badge-gray'}`}
                        onClick={() => handleToggle(pb.id)}>{pb.enabled ? 'Active' : 'Disabled'}</span>
                    </td>
                    <td>
                      <div className="flex gap-4">
                        <button className="btn btn-sm btn-xs" onClick={() => { setEditing(pb); setShowNew(false); }}>Edit</button>
                        <button className="btn btn-sm btn-danger btn-xs" onClick={() => handleDelete(pb.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Playbook Execution Log ({audit.length})</div>
            <button className="btn btn-sm" onClick={() => auditR.refetch()}>&#8635;</button>
          </div>
          {audit.length === 0 ? (
            <div className="empty-state">No playbook executions yet. Trigger ITDR or SIEM detections to see results here.</div>
          ) : (
            <div className="table-container" style={{ maxHeight: 500, overflow: 'auto' }}>
              <table>
                <thead><tr className="th-sticky">
                  <th>Time</th><th>Playbook</th><th>Alert</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {audit.slice().reverse().map((e, i) => (
                    <tr key={e.timestamp + e.playbook_name}>
                      <td className="text-sm text-nowrap">{fmtTime(e.timestamp)}</td>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{e.playbook_name}</td>
                      <td className="text-sm">
                        {e.alert?.severity && <span className={`badge ${e.alert.severity === 'critical' ? 'badge-red' : 'badge-amber'} badge-xs`}>{e.alert.severity}</span>}
                        {' '}{e.alert?.title || e.alert?.detection_name || '-'}
                      </td>
                      <td className="text-sm">
                        {(e.results || []).map((r, j) => (
                          <span key={r.action_type + j} className={`badge ${r.success ? 'badge-green' : 'badge-red'} badge-xs`}>{r.action_type}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function KpiCard({ value, label, sub, color }) {
  return (
    <div className="kpi-card" style={{ borderTop: `2px solid ${color || 'var(--accent)'}` }}>
      <div className="kpi-value" style={{ color: color || 'var(--accent)', fontSize: 24 }}>{value ?? '-'}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="text-xs text-secondary" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
