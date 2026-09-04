import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function formatDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

export default function Organizations() {
  const r = useApi(() => fetch('/api/platform/orgs').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }), []);
  const toast = useToast();
  const [name, setName] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const res = await fetch('/api/platform/orgs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name}) });
      if (!res.ok) { toast(`Create failed: ${res.status} ${res.statusText}`, 'error'); return; }
      const d = await res.json();
      if (d.id) { toast(`Org created: ${d.name}`, 'success'); setName(''); r.refetch(); }
      else { toast('Failed to create organization', 'error'); }
    } catch (e) {
      toast(`Network error creating org: ${e.message}`, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this organization?')) return;
    try {
      const res = await fetch(`/api/platform/orgs/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast(`Delete failed: ${res.status} ${res.statusText}`, 'error'); return; }
      const d = await res.json();
      if (d.success) { toast('Organization deleted', 'success'); r.refetch(); }
      else { toast('Failed to delete organization', 'error'); }
    } catch (e) {
      toast(`Network error deleting org: ${e.message}`, 'error');
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const orgs = r.data?.organizations || [];

  return (
    <>
      <div className="card card-mb">
        <div className="card-header">
          <div className="card-title">Organizations ({orgs.length})</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="New organization name..."
            style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none' }}
          />
          <button className="btn btn-sm btn-primary" disabled={!name.trim()} onClick={handleCreate}>Create</button>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o.id}>
                <td><code>{o.id}</code></td>
                <td>{o.name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(o.created_at)}</td>
                <td>
                  <button className="btn btn-sm btn-danger" disabled={o.id === 'default'} onClick={() => handleDelete(o.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
      </div>

      <M365Tenants orgs={orgs} />
    </>
  );
}

/** M365 tenant registry — per-tenant Graph credentials live in .env, not here. */
function M365Tenants({ orgs }) {
  const toast = useToast();
  const t = useApi(() => fetch('/api/itdr/tenants').then(r => r.json()), []);
  const [form, setForm] = useState({ name: '', tenant_id: '', env_prefix: '', org_id: 'default' });
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast('Tenant name is required', 'error'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/itdr/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (d.success) {
        toast(`M365 tenant registered: ${d.tenant.id}`, 'success');
        setForm({ name: '', tenant_id: '', env_prefix: '', org_id: 'default' });
        t.refetch();
      } else {
        toast(d.error || 'Failed to register tenant', 'error');
      }
    } catch (e) {
      toast(`Network error: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (id, enabled) => {
    try {
      const res = await fetch(`/api/itdr/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const d = await res.json();
      if (d.success) { toast(`Tenant ${enabled ? 'enabled' : 'disabled'}`, 'success'); t.refetch(); }
      else toast(d.error || 'Update failed', 'error');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handlePoll = async (id) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/itdr/poll/${id}`, { method: 'POST' });
      const d = await res.json();
      if (d.status === 'ok') toast(`Poll OK — ${d.sign_ins} sign-ins, ${d.audit_logs} audits, ${d.detections} detections`, 'success');
      else if (d.status === 'not_configured') toast(`Tenant not configured: add ITDR_${(id).toUpperCase()}_CLIENT_ID/_CLIENT_SECRET to .env`, 'info');
      else toast(`Poll: ${d.message || d.status}`, 'error');
      t.refetch();
    } catch (e) {
      toast(`Poll failed: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(`Remove M365 tenant '${id}'? Events/cases stay, polling stops.`)) return;
    try {
      const res = await fetch(`/api/itdr/tenants/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) { toast('Tenant removed', 'success'); t.refetch(); }
      else toast(d.error || 'Delete failed', 'error');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const tenants = t.data?.tenants || [];
  const configured = tenants.filter(x => x.configured && x.enabled).length;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">M365 Tenants ({tenants.length})</div>
        <span className="text-sm text-secondary">{configured} polling / {tenants.length - configured} need credentials</span>
      </div>
      <div className="text-md text-secondary" style={{ lineHeight: 1.6, marginBottom: 12 }}>
        Register each Microsoft 365 tenant you manage. Secrets never touch the UI &mdash; set them on the SOC server in <code>.env</code>:
        <pre className="code-block" style={{ marginTop: 6, fontSize: 12 }}>
# env prefix is derived from the registration (here: prefix "SIMPLYICT")
ITDR_SIMPLYICT_TENANT_ID=tenant-guid
ITDR_SIMPLYICT_CLIENT_ID=app-client-id
ITDR_SIMPLYICT_CLIENT_SECRET=app-secret</pre>
      </div>
      <div className="panel" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tenant name (e.g. SimplyICT)" style={{ ...inputStyle }} />
        <input value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })} placeholder="Azure tenant GUID (optional)" style={{ ...inputStyle }} />
        <input value={form.env_prefix} onChange={e => setForm({ ...form, env_prefix: e.target.value })} placeholder="Env prefix (optional)" style={{ ...inputStyle }} />
        <select value={form.org_id} onChange={e => setForm({ ...form, org_id: e.target.value })} style={{ ...inputStyle }}>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" disabled={busy || !form.name.trim()} onClick={handleCreate}>Add tenant</button>
      </div>
      {tenants.length === 0 ? (
        <div className="empty-state">No M365 tenants registered yet. Add your first managed tenant above.</div>
      ) : (
        <table>
          <thead><tr>
            <th>Tenant</th><th>Status</th><th>Last Poll</th><th>Events</th><th>Org</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {tenants.map(x => (
              <tr key={x.id}>
                <td>
                  <div className="text-base">{x.name}</div>
                  <div className="text-sm text-secondary"><code>{x.id}</code></div>
                </td>
                <td>
                  <span className={`badge ${
                    !x.enabled ? 'badge-gray' :
                    !x.configured ? 'badge-amber' :
                    x.last_status === 'ok' ? 'badge-green' :
                    x.last_status === 'error' ? 'badge-red' :
                    'badge-gray'
                  }`}>
                    {!x.enabled ? 'disabled' : !x.configured ? 'no creds' : x.last_status || 'never polled'}
                  </span>
                </td>
                <td className="text-sm">{formatDate(x.last_poll)}</td>
                <td><span className="badge badge-accent">{x.event_count}</span></td>
                <td className="text-sm">{x.org_id}</td>
                <td className="text-nowrap">
                  <button className="btn btn-sm" disabled={busy} onClick={() => handlePoll(x.id)}>Poll</button>{' '}
                  <button className="btn btn-sm" onClick={() => handleToggle(x.id, !x.enabled)}>{x.enabled ? 'Disable' : 'Enable'}</button>{' '}
                  <button className="btn btn-sm btn-danger" disabled={x.id === 'default'} onClick={() => handleDelete(x.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  outline: 'none',
  minWidth: 0,
};