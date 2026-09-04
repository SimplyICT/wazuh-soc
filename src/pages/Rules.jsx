import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import KpiCard from '../components/KpiCard';
import { useToast } from '../context/ToastContext';

const RULE_TYPES = [
  { value: 'cross_source', label: 'Cross-Source', desc: 'Same IP in multiple log sources' },
  { value: 'port_scan', label: 'Port Scan', desc: 'Same IP hitting multiple ports' },
  { value: 'severity_spike', label: 'Severity Spike', desc: 'Cluster of high-severity events' },
];
const SEVS = ['info', 'low', 'medium', 'high', 'critical'];

function severityBadgeClass(severity) {
  if (severity === 'critical') return 'badge-red';
  if (severity === 'high') return 'badge-amber';
  return 'badge-gray';
}

function RuleEditor({ rule, onSave, onCancel }) {
  const [form, setForm] = useState(rule || {
    name: '', description: '', severity: 'medium', mitre_technique: '', mitre_tactic: '',
    conditions: { type: 'cross_source', sources: ['firewall', 'windows'], field: 'ip_src', time_window_min: 5 },
  });
  const [testR, setTestR] = useState(null);
  const [testing, setTesting] = useState(false);
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const uc = (k, v) => setForm(f => ({ ...f, conditions: { ...f.conditions, [k]: v } }));

  const test = async () => {
    setTesting(true);
    try { const r = await fetch('/api/rules/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); setTestR(await r.json()); } catch (err) { console.error('Test rule error:', err); toast?.(err.message || 'Test failed', 'error'); }
    setTesting(false);
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
        {rule ? `Edit: ${rule.name}` : 'New Rule'}
      </div>
      <div className="flex-col gap-10">
        <div className="flex gap-10">
          <div className="flex-1">
            <label className="label">Name</label>
            <input value={form.name} onChange={e => up('name', e.target.value)}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ width: 120 }}>
            <label className="label">Severity</label>
            <select value={form.severity} onChange={e => up('severity', e.target.value)}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '6px', fontSize: 13, outline: 'none' }}>
              {SEVS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ width: 100, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            <button className="btn btn-sm" onClick={test} disabled={testing} style={{ flex: 1 }}>{testing ? '...' : 'Test'}</button>
            <button className="btn btn-sm btn-primary" onClick={() => onSave(form)} style={{ flex: 1 }}>Save</button>
            <button className="btn btn-sm" onClick={onCancel} style={{ flex: 1 }}>X</button>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea value={form.description} onChange={e => up('description', e.target.value)} rows={2}
            style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none', resize: 'vertical' }} />
        </div>

        <div className="flex gap-10">
          <div className="flex-1">
            <label className="label">MITRE Tech</label>
            <input value={form.mitre_technique} onChange={e => up('mitre_technique', e.target.value)} placeholder="T1110"
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none' }} />
          </div>
          <div className="flex-1">
            <label className="label">Tactic</label>
            <input value={form.mitre_tactic} onChange={e => up('mitre_tactic', e.target.value)} placeholder="credential_access"
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none' }} />
          </div>
        </div>

        <div>
          <label className="label">Type</label>
          <div className="flex gap-4 flex-wrap">
            {RULE_TYPES.map(rt => (
              <span key={rt.value} className={`filter-tab ${form.conditions?.type === rt.value ? 'active' : ''}`}
                onClick={() => { setForm(f => ({ ...f, conditions: { type: rt.value, sources: ['firewall', 'windows'], field: 'ip_src', time_window_min: 5 } })); setTestR(null); }}
                style={{ cursor: 'pointer' }}>{rt.label}</span>
            ))}
          </div>
        </div>

        {form.conditions?.type === 'cross_source' && (
          <div className="flex gap-10">
            <div className="flex-1">
              <label className="label">Sources</label>
              <div className="flex gap-4 flex-wrap">
                {['firewall', 'windows', 'syslog', 'signIn', 'auditLog'].map(s => (
                  <span key={s} className="filter-tab active text-sm" style={{ cursor: 'pointer' }}
                    onClick={() => { const srcs = form.conditions?.sources || []; uc('sources', srcs.includes(s) ? srcs.filter(x => x !== s) : [...srcs, s]); }}>{s}</span>
                ))}
              </div>
            </div>
            <div style={{ width: 120 }}>
              <label className="label">Field</label>
              <select value={form.conditions?.field || 'ip_src'} onChange={e => uc('field', e.target.value)}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '6px', fontSize: 12, outline: 'none' }}>
                <option value="ip_src">Src IP</option><option value="ip_dst">Dst IP</option><option value="user">User</option>
              </select>
            </div>
            <div style={{ width: 100 }}>
              <label className="label">Time (min)</label>
              <input type="number" value={form.conditions?.time_window_min || 5} onChange={e => uc('time_window_min', +e.target.value || 5)}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', padding: '6px', borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none' }} />
            </div>
          </div>
        )}

        {form.conditions?.type === 'port_scan' && (
          <div className="flex gap-10">
            <div className="flex-1">
              <label className="label">Field</label>
              <select value={form.conditions?.field || 'ip_src'} onChange={e => uc('field', e.target.value)}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '6px', fontSize: 12, outline: 'none' }}>
                <option value="ip_src">Src IP</option><option value="ip_dst">Dst IP</option>
              </select>
            </div>
            <div style={{ width: 120 }}>
              <label className="label">Min Ports</label>
              <input type="number" value={form.conditions?.min_ports || 10} onChange={e => uc('min_ports', +e.target.value || 10)}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', padding: '6px', borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none' }} />
            </div>
          </div>
        )}

        {form.conditions?.type === 'severity_spike' && (
          <div className="flex gap-10">
            <div style={{ width: 120 }}><label className="label">Min Events</label>
              <input type="number" value={form.conditions?.min_events || 5} onChange={e => uc('min_events', +e.target.value || 5)}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', padding: '6px', borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ width: 100 }}><label className="label">Window (min)</label>
              <input type="number" value={form.conditions?.time_window_min || 5} onChange={e => uc('time_window_min', +e.target.value || 5)}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', color: 'var(--text)', padding: '6px', borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none' }} />
            </div>
          </div>
        )}

        {testR && (
          <div style={{ padding: 10, background: 'var(--bg)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Match: {testR.matches} (from {testR.logs_checked} logs)</div>
            {testR.examples?.slice(0, 3).map((ex, i) => (
              <div key={JSON.stringify(ex)} className="text-sm" style={{ padding: '2px 0', borderBottom: '1px solid var(--border)' }}>{JSON.stringify(ex)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Rules() {
  const r = useApi(() => fetch('/api/rules').then(r => r.json()), []);
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const rules = r.data?.rules || [];
  const builtin = rules.filter(r => r.source === 'builtin');
  const custom = rules.filter(r => r.source !== 'builtin');

  const handleSave = async (form) => {
    try {
      const isNew = !form.id;
      const res = await fetch(isNew ? '/api/rules' : `/api/rules/${form.id}`, {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (res.ok) { toast('Created', 'success'); setShowNew(false); setEditing(null); r.refetch(); }
      else { toast('Failed', 'error'); }
    } catch (err) { console.error('Save rule error:', err); toast('Network error', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete?')) return;
    try {
      await fetch(`/api/rules/${id}`, { method: 'DELETE' });
      toast('Deleted', 'success'); r.refetch();
    } catch (err) { console.error('Delete rule error:', err); toast('Network error', 'error'); }
  };

  const handleToggle = async (id) => {
    try {
      await fetch(`/api/rules/${id}/toggle`, { method: 'POST' });
      r.refetch();
    } catch (err) { console.error('Toggle rule error:', err); }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/rules/export');
      const d = await res.json();
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'soc-rules-export.json'; a.click();
      toast('Exported', 'success');
    } catch (err) { console.error('Export rules error:', err); toast('Export failed', 'error'); }
  };

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={rules.length} label="Total" color="accent" />
        <KpiCard value={builtin.length} label="Built-in" color="green" />
        <KpiCard value={custom.length} label="Custom" color="amber" />
        <KpiCard value={rules.filter(r => r.enabled !== false).length} label="Enabled" color="green" />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Correlation Rules</div>
          <div className="flex gap-6">
            <button className="btn btn-sm btn-primary" onClick={() => { setShowNew(true); setEditing(null); }}>+ New</button>
            <button className="btn btn-sm" onClick={handleExport}>Export</button>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>XML
              <input type="file" accept=".xml" style={{ display: 'none' }}
                onChange={e => { const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=async() => { const res=await fetch('/api/rules/import/xml',{method:'POST',body:r.result}); const d=await res.json(); toast(`Imported ${d.imported} rules`,'success'); r.refetch(); }; r.readAsText(f); e.target.value=''; }} />
            </label>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>Sigma YAML
              <input type="file" accept=".yml,.yaml" style={{ display: 'none' }}
                onChange={e => { const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=async() => { const res=await fetch('/api/rules/import/sigma',{method:'POST',body:r.result}); const d=await res.json(); toast(`Imported ${d.imported} Sigma rules`,'success'); r.refetch(); }; r.readAsText(f); e.target.value=''; }} />
            </label>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>JSON
              <input type="file" accept=".json" style={{ display: 'none' }}
                onChange={e => { const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=async() => { const res=await fetch('/api/rules/import/json',{method:'POST',body:r.result,headers:{'Content-Type':'application/json'}}); const d=await res.json(); toast(`Imported ${d.imported} rules`,'success'); r.refetch(); }; r.readAsText(f); e.target.value=''; }} />
            </label>
          </div>
        </div>

        {rules.length === 0 ? (
          <div className="empty-state">No rules. Create new or import from XML/Sigma/JSON.</div>
        ) : (
          <table>
            <thead><tr><th>Source</th><th>Name</th><th>Severity</th><th>MITRE</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={rule.id || i} style={{ opacity: rule.enabled === false ? 0.5 : 1 }}>
                  <td><span className="badge" style={{ fontSize: 10, background: rule.source === 'builtin' ? 'var(--bg)' : 'var(--accent)', color: rule.source === 'builtin' ? 'var(--text-secondary)' : '#fff' }}>{rule.source}</span></td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{rule.name}</td>
                  <td><span className={`badge ${severityBadgeClass(rule.severity)} badge-xs`}>{rule.severity}</span></td>
                  <td>{rule.mitre_technique && <code className="text-sm">{rule.mitre_technique}</code>}</td>
                  <td><span className={`badge ${rule.enabled !== false ? 'badge-green' : 'badge-gray'} badge-click`}
                    onClick={() => handleToggle(rule.id)}>{rule.enabled !== false ? 'On' : 'Off'}</span></td>
                  <td>{rule.source !== 'builtin' && (
                    <div className="flex gap-4">
                      <button className="btn btn-sm btn-xs" onClick={() => { setEditing(rule); setShowNew(false); }}>Edit</button>
                      <button className="btn btn-sm btn-danger btn-xs" onClick={() => handleDelete(rule.id)}>Del</button>
                    </div>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal for rule editor */}
      {(showNew || editing) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }} onClick={() => { setShowNew(false); setEditing(null); }}>
          <div style={{
            background: '#1e293b', borderRadius: 12, padding: 24,
            maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto',
            border: '1px solid #334155', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            <RuleEditor rule={editing} onSave={handleSave}
              onCancel={() => { setShowNew(false); setEditing(null); }} />
          </div>
        </div>
      )}
    </>
  );
}

