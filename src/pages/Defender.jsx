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

const SEV = { critical: 'badge-red', high: 'badge-red', medium: 'badge-amber', low: 'badge-gray', informational: 'badge-gray' };
const badge = (sev) => `badge ${SEV[sev] || 'badge-gray'}`;

function connBadge(status, missing, required) {
  const map = { ok: 'badge-green', missing_roles: 'badge-amber', no_credentials: 'badge-gray' };
  const label = status === 'missing_roles' ? 'not granted' : (status || '?');
  const title = status === 'missing_roles'
    ? `grant + consent: ${(missing && missing.length ? missing : required).join(', ')}`
    : '';
  return <span className={`badge ${map[status] || 'badge-gray'}`} title={title}>{label}</span>;
}

export default function Defender() {
  const toast = useToast();
  const [tab, setTab] = useState('alerts');
  const [busy, setBusy] = useState('');
  const s = useApi(() => fetch('/api/defender/summary').then(r => r.json()), []);
  const list = useApi(() => fetch(`/api/defender/alerts?source=${tab === 'endpoint' ? 'endpoint' : tab}`).then(r => r.json()), [tab]);

  if (s.loading) return <LoadingSpinner />;
  if (s.error) return <ErrorState message={s.error.message} onRetry={s.refetch} />;

  const d = s.data || {};
  const rows = list.data?.alerts || [];

  const testTenant = async (id) => {
    setBusy(`test:${id}`);
    try {
      const res = await fetch(`/api/itdr/tenants/${encodeURIComponent(id)}/health`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'health check failed');
      const p = data.permissions || {};
      toast(`${id}: Identity ${p.identity} · M365 Defender ${p.defender}${p.defender === 'missing_roles' ? ` (grant ${(p.defender_missing_roles || []).join(', ')})` : ''}`, p.identity === 'ok' ? 'success' : 'error');
      s.refetch();
    } catch (e) { toast(`Connection test failed: ${e.message}`, 'error'); }
    setBusy('');
  };

  const pollNow = async (id) => {
    setBusy(`poll:${id}`);
    try {
      const res = await fetch(`/api/itdr/poll/${encodeURIComponent(id)}`, { method: 'POST' });
      const data = await res.json();
      toast(`${id}: ${data.status} · Defender ${data.defender || '?'} · Endpoint ${data.mde || '?'} · ${data.defender_alerts || 0}/${data.defender_incidents || 0}/${data.mde_alerts || 0} new`, 'success');
      s.refetch(); list.refetch();
    } catch (e) { toast(`Poll failed: ${e.message}`, 'error'); }
    setBusy('');
  };

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={d.alerts ?? 0} label="Defender alerts (XDR)" color="amber" sub={`${d.last_24h?.alerts || 0} in 24h`} />
        <KpiCard value={d.incidents ?? 0} label="Incidents" color="amber" sub={`${d.last_24h?.incidents || 0} in 24h`} />
        <KpiCard value={d.endpoint_alerts ?? 0} label="Endpoint alerts (MDE)" color={d.endpoint_alerts ? 'red' : 'accent'} sub={`${d.last_24h?.endpoint_alerts || 0} in 24h`} />
        <KpiCard value={d.open_cases ?? 0} label="Open cases" color="red" sub={`${d.cases || 0} total`} />
        <KpiCard value={d.queue_open ?? 0} label="In review queue" color={d.queue_open ? 'amber' : 'green'} sub={`${d.queue_items || 0} raised`} />
      </div>

      <div className="card card-mb">
        <div className="card-header">
          <div className="card-title">M365 tenants — Defender connections</div>
          <span className="text-sm text-secondary">
            Roles: XDR {(d.roles_required?.xdr || []).join(', ')} · Endpoint {(d.roles_required?.endpoint || []).join(', ')}
          </span>
        </div>
        {(d.tenants || []).length === 0 ? (
          <div className="empty-state">No M365 tenant registered yet — add one on the Identity (ITDR) page.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Tenant</th><th>Identity</th><th>M365 Defender (XDR)</th><th>Defender for Endpoint</th><th>Last poll</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {(d.tenants || []).map(t => (
                <tr key={t.id}>
                  <td>
                    <div className="text-base">{t.name}</div>
                    <div className="text-sm text-secondary"><code>{t.id}</code></div>
                  </td>
                  <td>{connBadge(t.identity, [], [])}</td>
                  <td>{connBadge(t.xdr, t.xdr_missing_roles, d.roles_required?.xdr)}</td>
                  <td>{connBadge(t.endpoint, t.endpoint_missing_roles, d.roles_required?.endpoint)}</td>
                  <td className="text-sm">
                    {formatDate(t.last_poll)}
                    {t.last_counts && (
                      <div className="text-xs text-secondary">
                        {(t.last_counts.defender_alerts || 0)} xdr · {(t.last_counts.defender_incidents || 0)} inc · {(t.last_counts.mde_alerts || 0)} endpoint
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-6">
                      <button className="btn btn-xs" disabled={busy === `test:${t.id}`} onClick={() => testTenant(t.id)}>
                        {busy === `test:${t.id}` ? '...' : 'Test'}
                      </button>
                      <button className="btn btn-xs" disabled={busy === `poll:${t.id}` || !t.configured} onClick={() => pollNow(t.id)}>
                        {busy === `poll:${t.id}` ? '...' : 'Poll now'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(d.tenants || []).some(t => t.endpoint === 'missing_roles') && (
          <div className="text-sm text-secondary" style={{ padding: '10px 14px' }}>
            <span>Endpoint alerts need the app registration to hold </span>
            <code>Alert.Read.All</code>
            <span> (and </span>
            <code>Machine.Read.All</code>
            <span> for device inventory) on the <b>Microsoft Defender for Endpoint</b> API — Entra ID → App registrations → the app → API permissions → Add a permission → APIs my organization uses → WindowsDefenderATP → Application permissions → Grant admin consent. M365 Defender (XDR) alerts and incidents work without it.</span>
          </div>
        )}
      </div>

      <div className="tabs">
        <span className={`tab ${tab === 'alerts' ? 'active' : ''}`} onClick={() => setTab('alerts')}>Alerts ({d.alerts || 0})</span>
        <span className={`tab ${tab === 'incidents' ? 'active' : ''}`} onClick={() => setTab('incidents')}>Incidents ({d.incidents || 0})</span>
        <span className={`tab ${tab === 'endpoint' ? 'active' : ''}`} onClick={() => setTab('endpoint')}>Endpoint ({d.endpoint_alerts || 0})</span>
      </div>

      <div className="card">
        {list.loading ? <LoadingSpinner /> : rows.length === 0 ? (
          <div className="empty-state">
            Nothing stored for this source yet. Defender only reports what the tenant's licences produce — an idle tenant shows an empty list.
          </div>
        ) : (
          <table>
            <thead><tr>
              <th>Created</th><th>Severity</th><th>Title</th><th>Status</th><th>Device / User</th><th>MITRE</th><th>Source</th>
            </tr></thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id}>
                  <td className="text-sm">{formatDate(e.timestamp)}</td>
                  <td><span className={badge(e.severity)}>{e.severity || '?'}</span></td>
                  <td>
                    <div className="text-base">{e.title || '-'}</div>
                    {e.description && <div className="text-xs text-secondary">{String(e.description).slice(0, 140)}</div>}
                  </td>
                  <td><span className="badge badge-gray">{e.status || '-'}</span></td>
                  <td className="text-sm">{[e.device, e.user].filter(Boolean).join(' · ') || '-'}</td>
                  <td className="text-sm">{(e.mitre || []).join(', ') || '-'}</td>
                  <td className="text-sm">{e.service_source || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
