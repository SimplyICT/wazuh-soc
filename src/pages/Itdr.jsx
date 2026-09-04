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
            <p>Register each managed tenant in <b>Organizations</b> (M365 Tenants tab), then set credentials on the SOC server. Per tenant, the env prefix from registration is used:</p>
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
            <table>
              <thead><tr>
                <th>Tenant</th><th>Status</th><th>Last Poll</th><th>Events</th><th>Cases</th><th>Org</th>
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
                        t.last_status === 'not_configured' ? 'badge-amber' :
                        t.last_status === 'error' ? 'badge-red' :
                        'badge-gray'
                      }`}>
                        {!t.enabled ? 'disabled' : !t.configured ? 'no creds' : t.last_status || 'never polled'}
                      </span>
                    </td>
                    <td className="text-sm">{formatDate(t.last_poll)}</td>
                    <td><span className="badge badge-accent">{t.event_count}</span></td>
                    <td><span className="badge badge-gray">{t.case_count}</span></td>
                    <td className="text-sm">{t.org_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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