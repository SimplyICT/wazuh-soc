import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function formatDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

function tenantBadge(tenantId, tenantName) {
  return (
    <span className="badge badge-gray" title={`M365 tenant: ${tenantName || tenantId}`}>
      {tenantName || tenantId || 'default'}
    </span>
  );
}

export default function Itdr() {
  const toast = useToast();
  const [tenantFilter, setTenantFilter] = useState('');
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', tenant_id: '', client_id: '', client_secret: '', env_prefix: '' });

  const r = useApi(() => fetch('/api/itdr/summary').then(r => r.json()), []);
  const eventsR = useApi(
    () => fetch(`/api/itdr/events?limit=100${tenantFilter ? `&tenant=${encodeURIComponent(tenantFilter)}` : ''}`).then(r => r.json()),
    [tenantFilter]
  );
  const casesR = useApi(
    () => fetch(`/api/itdr/cases${tenantFilter ? `?tenant=${encodeURIComponent(tenantFilter)}` : ''}`).then(r => r.json()),
    [tenantFilter]
  );
  const [activeTab, setActiveTab] = useState('overview');

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const d = r.data || {};
  const events = eventsR.data?.events || [];
  const cases = casesR.data?.cases || [];
  const tenants = d.tenants || [];
  const multiTenant = tenants.length > 1;

  const handlePoll = async () => {
    setPolling(true);
    try {
      const res = await fetch('/api/itdr/poll', { method: 'POST' });
      const data = await res.json();
      const ok = data.tenants?.filter(t => t.status === 'ok').length || 0;
      const bad = (data.tenants || []).length - ok;
      toast(`Poll complete: ${ok} tenant(s) fetched${bad ? `, ${bad} not_configured/skipped` : ''}`, ok > 0 ? 'success' : 'info');
      r.refetch(); eventsR.refetch(); casesR.refetch();
    } catch (e) {
      toast(`Poll failed: ${e.message}`, 'error');
    } finally {
      setPolling(false);
    }
  };

  const testConnection = async (id) => {
    setBusy(`test:${id}`);
    try {
      const res = await fetch(`/api/itdr/tenants/${encodeURIComponent(id)}/health`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'health check failed');
      const perms = data.permissions || {};
      const msg = `Identity: ${perms.identity || '?'} · Defender: ${perms.defender || '?'}` +
        (perms.defender === 'missing_roles' ? ` (grant ${(perms.defender_missing_roles || []).join(', ')})` : '');
      toast(`${id}: ${msg}`, perms.identity === 'ok' ? 'success' : 'error');
      r.refetch();
    } catch (e) { toast(`Connection test failed: ${e.message}`, 'error'); }
    setBusy('');
  };

  // Onboarding: register the tenant and hand over its app-registration
  // credentials in one step (stored server-side, never returned to the browser).
  const addTenant = async () => {
    if (!form.name.trim()) { toast('Tenant name is required', 'error'); return; }
    const hasCreds = form.client_id.trim() && form.client_secret.trim();
    if (hasCreds && !form.tenant_id.trim()) { toast('Tenant ID (directory GUID) is required with credentials', 'error'); return; }
    setBusy('add');
    try {
      const res = await fetch('/api/itdr/tenants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), tenant_id: form.tenant_id.trim(),
          env_prefix: form.env_prefix.trim(), org_id: 'default',
          client_id: form.client_id.trim(), client_secret: form.client_secret.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'could not create tenant');
      const perms = data.tenant?.permissions;
      toast(perms
        ? `Tenant added — Identity: ${perms.identity}, Defender: ${perms.defender}${perms.defender === 'missing_roles' ? ` (grant ${(perms.defender_missing_roles || []).join(', ')})` : ''}`
        : 'Tenant added — set credentials to start polling', 'success');
      setForm({ name: '', tenant_id: '', client_id: '', client_secret: '', env_prefix: '' });
      setAdding(false);
      r.refetch();
    } catch (e) { toast(`Add tenant failed: ${e.message}`, 'error'); }
    setBusy('');
  };

  const pollOne = async (id) => {
    setBusy(`poll:${id}`);
    try {
      const res = await fetch(`/api/itdr/poll/${encodeURIComponent(id)}`, { method: 'POST' });
      const data = await res.json();
      toast(`${id}: ${data.status || 'polled'}${data.defender ? ` · Defender: ${data.defender}` : ''}`,
        data.status === 'ok' ? 'success' : 'info');
      r.refetch();
    } catch (e) { toast(`Poll failed: ${e.message}`, 'error'); }
    setBusy('');
  };

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={d.total_events ?? 0} label="Identity Events" color="accent" sub="total stored" />
        <KpiCard value={d.critical ?? 0} label="Critical" color="red" sub={d.critical > 0 ? 'requires action' : 'clear'} />
        <KpiCard value={d.high ?? 0} label="High" color="amber" />
        <KpiCard value={d.open_cases ?? 0} label="Open Cases" color="red" sub={`${cases.length} shown`} />
        <KpiCard value={d.sources_configured ? 'Connected' : 'Disconnected'} label="M365 Tenants" color={d.sources_configured ? 'green' : 'red'} sub={d.sources_configured ? `${tenants.filter(t => t.configured && t.enabled).length} configured` : 'configure required'} />
      </div>

      {multiTenant && (
        <div className="card card-mb">
          <div className="card-header">
            <div className="card-title">M365 Tenant Filter</div>
            <button className="btn btn-sm" onClick={handlePoll} disabled={polling}>
              {polling ? 'Polling...' : '&#8635; Poll all tenants now'}
            </button>
          </div>
          <div className="filter-tabs">
            <select
              value={tenantFilter}
              onChange={e => setTenantFilter(e.target.value)}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
            >
              <option value="">All tenants</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!d.sources_configured && (
        <div className="card card-border-left-red card-mb">
          <div className="card-header">
            <div className="card-title text-red">&#9888; M365 Not Configured</div>
          </div>
          <div className="text-md text-secondary" style={{ lineHeight: 1.7 }}>
            <p>Add each managed tenant on the <b>Tenants</b> tab (name + directory ID + app client id/secret) — credentials are stored server-side (mode 600). The env-var route still works and takes precedence:</p>
            <pre className="code-block" style={{ marginTop: 8 }}>
# for a tenant registered with env prefix "SIMPLYICT" or id "simplyict"
ITDR_SIMPLYICT_TENANT_ID=your-tenant-guid
ITDR_SIMPLYICT_CLIENT_ID=your-app-client-id
ITDR_SIMPLYICT_CLIENT_SECRET=your-app-secret</pre>
            <p style={{ marginTop: 8 }}>Required Graph API permissions per app registration:</p>
            <ul className="text-base" style={{ marginLeft: 20 }}>
              <li><code>AuditLog.Read.All</code> — sign-in + audit logs</li>
              <li><code>IdentityRiskEvent.Read.All</code> — risk detections</li>
              <li><code>Directory.Read.All</code> — user/role data</li>
              <li><code>SecurityAlert.Read.All</code> — Defender XDR alerts (threat pickup)</li>
              <li><code>SecurityIncident.Read.All</code> — Defender XDR incidents</li>
            </ul>
            <p style={{ marginTop: 8 }}>
              <button className="btn btn-sm" onClick={handlePoll} disabled={polling}>
                {polling ? 'Polling...' : '&#8635; Poll now (checks credentials)'}
              </button>
            </p>
          </div>
        </div>
      )}

      <div className="tabs">
        <span className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</span>
        <span className={`tab ${activeTab === 'tenants' ? 'active' : ''}`} onClick={() => setActiveTab('tenants')}>Tenants ({tenants.length})</span>
        <span className={`tab ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>Events ({events.length})</span>
        <span className={`tab ${activeTab === 'cases' ? 'active' : ''}`} onClick={() => setActiveTab('cases')}>Cases ({cases.length})</span>
      </div>

      {activeTab === 'tenants' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">M365 Tenants</div>
            <button className="btn btn-sm" onClick={handlePoll} disabled={polling}>
              {polling ? 'Polling...' : '&#8635; Poll all'}
            </button>
          </div>
          {tenants.length === 0 ? (
            <div className="empty-state">No tenants registered. Add them in Organizations &rarr; M365 Tenants.</div>
          ) : (
            <>
            <table>
              <thead><tr>
                <th>Tenant</th><th>Polling</th><th>Identity</th><th>Defender</th><th>Last Poll</th><th>Events</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="text-base">{t.name}</div>
                      <div className="text-sm text-secondary"><code>{t.id}</code>{t.tenant_id ? ` · ${t.tenant_id}` : ''}</div>
                    </td>
                    <td>
                      <span className={`badge ${
                        !t.enabled ? 'badge-gray' :
                        !t.configured ? 'badge-amber' :
                        t.last_status === 'ok' ? 'badge-green' :
                        t.last_status === 'error' ? 'badge-red' :
                        'badge-gray'
                      }`} title={t.last_error || ''}>
                        {!t.enabled ? 'disabled' : !t.configured ? 'no creds' : t.last_status || 'never polled'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${
                        t.identity === 'ok' ? 'badge-green' :
                        t.identity === 'missing_roles' ? 'badge-red' :
                        t.identity ? 'badge-amber' : 'badge-gray'
                      }`}>{t.identity || '?'}</span>
                    </td>
                    <td>
                      <span className={`badge ${
                        t.defender === 'ok' ? 'badge-green' :
                        t.defender === 'missing_roles' ? 'badge-amber' :
                        t.defender ? 'badge-gray' : 'badge-gray'
                      }`} title={t.defender === 'missing_roles' ? `grant + consent: ${(t.defender_missing_roles || []).join(', ')}` : ''}>
                        {t.defender === 'missing_roles' ? 'not granted' : (t.defender || '?')}
                      </span>
                    </td>
                    <td className="text-sm">
                      {formatDate(t.last_poll)}
                      {t.last_counts && (
                        <div className="text-xs text-secondary">
                          {(t.last_counts.defender_alerts || 0)} dfe alerts · {(t.last_counts.audit_logs || 0)} audits
                        </div>
                      )}
                    </td>
                    <td><span className="badge badge-accent">{t.event_count || 0}</span></td>
                    <td>
                      <div className="flex gap-6">
                        <button className="btn btn-xs" disabled={busy === `test:${t.id}`}
                          onClick={() => testConnection(t.id)}>
                          {busy === `test:${t.id}` ? '...' : 'Test'}
                        </button>
                        <button className="btn btn-xs" disabled={busy === `poll:${t.id}` || !t.configured}
                          onClick={() => pollOne(t.id)}>
                          {busy === `poll:${t.id}` ? '...' : 'Poll'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tenants.some(t => t.defender === 'missing_roles') && (
              <div className="text-sm text-secondary" style={{ padding: '10px 14px' }}>
                <span>Defender alerts require the application permissions </span>
                <code>SecurityAlert.Read.All</code>
                <span> and </span>
                <code>SecurityIncident.Read.All</code>
                <span> with admin consent in that tenant. Identity polling keeps working without them.</span>
              </div>
            )}
            <div className="card-header" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="card-title">Add M365 tenant</div>
              <button className="btn btn-sm" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Tenant'}</button>
            </div>
            {adding && (
              <div style={{ padding: '0 14px 14px' }}>
                <div className="text-sm text-secondary" style={{ marginBottom: 8 }}>
                  Register the customer tenant and (optionally) its app registration in one step.
                  The app needs <code>AuditLog.Read.All</code>, <code>IdentityRiskEvent.Read.All</code>,
                  <code>Directory.Read.All</code> and — for Defender threat pickup —
                  <code>SecurityAlert.Read.All</code> + <code>SecurityIncident.Read.All</code>, with admin
                  consent granted in that tenant.
                </div>
                {[['name', 'Display name (e.g. Currimundi Vet)'], ['tenant_id', 'Directory (tenant) ID GUID'],
                  ['client_id', 'Application (client) ID'], ['client_secret', 'Client secret'],
                  ['env_prefix', 'Env prefix (optional, e.g. CURRIMUNDI)']].map(([field, label]) => (
                  <input key={field} value={form[field]} placeholder={label}
                    type={field === 'client_secret' ? 'password' : 'text'}
                    onChange={e => setForm({ ...form, [field]: e.target.value })}
                    style={{ display: 'block', width: '100%', maxWidth: 460, marginBottom: 6, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
                ))}
                <button className="btn btn-sm btn-primary" disabled={busy === 'add'} onClick={addTenant}>
                  {busy === 'add' ? 'Adding...' : 'Add tenant'}
                </button>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="cols-2">
          <div className="card">
            <div className="card-header"><div className="card-title">Event Sources</div></div>
            <table><tbody>
              <tr><td>Sign-in Logs</td><td><span className="badge badge-accent">{d.by_source?.signIn || 0}</span></td></tr>
              <tr><td>Audit Logs</td><td><span className="badge badge-accent">{d.by_source?.auditLog || 0}</span></td></tr>
              <tr><td>Risk Detections</td><td><span className="badge badge-amber">{d.by_source?.riskDetection || 0}</span></td></tr>
            </tbody></table>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Detection Rules</div></div>
            <div className="text-md text-secondary" style={{ lineHeight: 1.7 }}>
              <p>Active detection rules available:</p>
              <ul style={{ marginLeft: 16, marginTop: 4 }}>
                <li>MFA Fatigue Attack</li>
                <li>Impossible Travel</li>
                <li>Anonymous IP Sign-in</li>
                <li>Privileged Role Assignment</li>
                <li>Mail Forwarding Rule</li>
                <li>Entra ID Risk Detection</li>
                <li>OAuth Application Consent</li>
                <li>User Security Info Reset</li>
                <li>Account Disabled/Enabled</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Identity Events ({events.length})</div>
            <button className="btn btn-sm" onClick={() => eventsR.refetch()}>Refresh</button>
          </div>
          {events.length === 0 ? (
            <div className="empty-state">
              {d.sources_configured ? 'No identity events yet. Poll to fetch.' : 'Configure M365 tenant to fetch events.'}
            </div>
          ) : (
            <div className="table-container" style={{ maxHeight: 500, overflow: 'auto' }}>
              <table>
                <thead><tr className="th-sticky">
                  <th>Time</th>{multiTenant && <th>Tenant</th>}<th>Source</th><th>User</th><th>Detail</th><th>Risk</th>
                </tr></thead>
                <tbody>
                  {events.map((ev, i) => (
                    <tr key={ev.created_at + ev.source + i}>
                      <td className="text-sm text-nowrap">{formatDate(ev.created_at)}</td>
                      {multiTenant && <td>{tenantBadge(ev.tenant_id, ev.tenant_name)}</td>}
                      <td>
                        <span className={`badge ${
                          ev.source === 'signIn' ? 'badge-accent' :
                          ev.source === 'auditLog' ? 'badge-gray' :
                          ev.source === 'riskDetection' ? 'badge-amber' :
                          'badge-gray'
                        }`}>{ev.source}</span>
                      </td>
                      <td className="text-base">{ev.user || '-'}</td>
                      <td className="text-base truncate">
                        {ev.activity || ev.risk_type || ev.ip_address || '-'}
                      </td>
                      <td>
                        <span className={`badge ${
                          ev.risk_level === 'high' ? 'badge-red' :
                          ev.risk_level === 'medium' ? 'badge-amber' :
                          'badge-gray'
                        }`}>{ev.risk_level || ev.status || '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'cases' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">ITDR Cases ({cases.length})</div>
          </div>
          {cases.length === 0 ? (
            <div className="empty-state">No ITDR cases. Run detection rules to generate cases from events.</div>
          ) : (
            <table>
              <thead><tr><th>Time</th>{multiTenant && <th>Tenant</th>}<th>Severity</th><th>Title</th><th>User</th><th>Status</th></tr></thead>
              <tbody>
                {cases.map((c, i) => (
                  <tr key={c.timestamp + c.title + i}>
                    <td className="text-sm">{formatDate(c.timestamp)}</td>
                    {multiTenant && <td>{tenantBadge(c.tenant_id, c.tenant_name)}</td>}
                    <td>
                      <span className={`badge ${
                        c.severity === 'critical' ? 'badge-red' :
                        c.severity === 'high' ? 'badge-amber' :
                        'badge-gray'
                      }`}>{c.severity}</span>
                    </td>
                    <td className="text-base">{c.title}</td>
                    <td className="text-base">{c.user}</td>
                    <td><span className="badge badge-gray">{c.status || 'open'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}