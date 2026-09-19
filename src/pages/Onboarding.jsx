import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

function CodeBlock({ label, code, note }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <pre style={{
        background: 'var(--bg)', padding: 14, borderRadius: 8, fontSize: 11,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
        border: '1px solid var(--border)',
      }}>{code}</pre>
      {note && <div className="text-sm text-secondary" style={{ marginTop: 4 }}>{note}</div>}
      <button className="btn btn-sm" style={{ marginTop: 4, fontSize: 11 }}
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

const connBadge = (status, via) => {
  const map = { ok: 'badge-green', missing_roles: 'badge-amber', no_credentials: 'badge-gray' };
  const label = status === 'missing_roles' ? 'not granted' : (status || '?');
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{label}{status === 'ok' && via === 'graph' ? ' (via Graph)' : ''}</span>;
};

export default function Onboarding() {
  const [orgId] = useState('default');
  const r = useApi(() => fetch(`/api/platform/onboarding?org_id=${encodeURIComponent(orgId)}`)
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); }), [orgId]);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const d = r.data || {};
  const dev = d.devices || {};
  const pub = dev.published || {};
  const install = d.install || {};
  const m365 = d.m365 || {};
  const logs = d.log_sources || {};
  const progress = d.progress || { done: 0, total: 0 };

  return (
    <>
      <div className="card card-mb">
        <div className="card-header">
          <div className="card-title">
            Onboarding — {d.organization || 'default'}{' '}
            <span className={`badge ${progress.done === progress.total ? 'badge-green' : 'badge-amber'}`} style={{ marginLeft: 8 }}>
              {progress.done}/{progress.total} done
            </span>
          </div>
          <span className="text-sm text-secondary">collector <code>{d.base_url}</code></span>
        </div>
        <table>
          <tbody>
            {(d.checklist || []).map(c => (
              <tr key={c.key}>
                <td style={{ width: 30 }}>
                  <span className={`badge ${c.done ? 'badge-green' : 'badge-amber'}`}>{c.done ? '✓' : '·'}</span>
                </td>
                <td className="text-base">{c.label}</td>
                <td className="text-sm text-secondary">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-mb">
        <div className="card-header">
          <div className="card-title">Devices</div>
          <span className="text-sm text-secondary">
            {dev.enrolled || 0} enrolled · {dev.online || 0} online · {dev.offline || 0} offline
            {' · '}
            {Object.entries(dev.by_platform || {}).map(([p, n]) => `${p} ${n}`).join(' · ')}
            {' · builds: '}{Object.entries(dev.by_build || {}).map(([b, n]) => `${b} ${n}`).join(', ') || '-'}
          </span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div className="text-sm text-secondary" style={{ marginBottom: 10 }}>
            Published agent: script <b>{pub.script?.version || '-'}</b>
            {pub.script?.sha256 ? ` (sha256 ${String(pub.script.sha256).slice(0, 12)}…)` : ''}
            {' · '}packaged exe <b>{pub.exe?.version || 'not built'}</b>
            {dev.device_auth?.key_configured
              ? ' · device auth ON (agents send X-EDR-Key; the installers carry it)'
              : ' · device auth OFF (EDR_WS_KEY unset — any reachable host can enrol)'}
          </div>
          <CodeBlock label="Windows — packaged agent (no Python on the target)" code={install.windows_exe} note={install.windows_note} />
          <CodeBlock label="Windows — script agent (installs Python 3.12)" code={install.windows_script} />
          <CodeBlock label="Linux / macOS" code={install.linux} note={install.linux_note} />
        </div>
        {(dev.behind || []).length > 0 && (
          <>
            <div className="card-header" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="card-title">
                Behind the published version ({dev.behind_count ?? (dev.behind || []).length})
                {(dev.behind || []).length < (dev.behind_count || 0) && ` — showing ${dev.behind.length}`}
              </div>
              <span className="text-sm text-secondary">these update automatically on their next check-in</span>
            </div>
            <table>
              <thead><tr><th>Host</th><th>Platform</th><th>Version</th><th>Published</th></tr></thead>
              <tbody>
                {(dev.behind || []).map(a => (
                  <tr key={a.name}>
                    <td className="text-base">{a.name}</td>
                    <td className="text-sm">{a.platform}</td>
                    <td className="text-sm">{a.version}</td>
                    <td className="text-sm">{a.latest_version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card card-mb">
        <div className="card-header">
          <div className="card-title">Microsoft 365 tenant</div>
          <span className="text-sm text-secondary">{m365.configure_hint}</span>
        </div>
        {(m365.tenants || []).length === 0 ? (
          <div className="empty-state">
            No tenant registered. <a href="#/itdr">Open Identity (ITDR) → Tenants</a> to add tenant_id / client_id / client_secret.
          </div>
        ) : (
          <table>
            <thead><tr><th>Tenant</th><th>Credentials</th><th>Defender XDR</th><th>Defender for Endpoint</th><th>Missing roles</th></tr></thead>
            <tbody>
              {(m365.tenants || []).map(t => (
                <tr key={t.id}>
                  <td className="text-base">{t.name}<div className="text-sm text-secondary"><code>{t.id}</code></div></td>
                  <td>{t.configured ? <span className="badge badge-green">ok</span> : <span className="badge badge-gray">not set</span>}</td>
                  <td>{connBadge(t.xdr)}</td>
                  <td>{connBadge(t.endpoint, t.endpoint_via)}</td>
                  <td className="text-sm text-secondary">{(t.xdr_missing_roles || []).join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(m365.write_capabilities?.missing || []).length > 0 && (
          <div className="text-sm text-secondary" style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
            <b>Resolutions are recorded in the SOC.</b> Pushing them back to Microsoft Defender needs these Graph application
            permissions (with admin consent) on the SOC app: <code>{(m365.write_capabilities.missing || []).join(', ')}</code>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Log sources</div>
          <span className="text-sm text-secondary">{logs.ingested || 0} events ingested
            {logs.by_source && Object.keys(logs.by_source).length > 0
              ? ` · ${Object.entries(logs.by_source).map(([s, n]) => `${s} ${n}`).join(', ')}` : ''}</span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <CodeBlock label="HTTP ingest (JSON / CEF / syslog lines)" code={logs.http_ingest?.curl}
            note={`auth: ${logs.http_ingest?.auth || 'unknown'}`} />
          <CodeBlock label={`Syslog receiver — ${logs.syslog?.active ? `listening on ${logs.syslog?.target}` : 'disabled'}`}
            code={logs.syslog?.active
              ? `# point firewalls/appliances at ${logs.syslog?.target}`
              : '# start the collector with SIEM_SYSLOG_PORT=514 to enable the UDP receiver'} />
        </div>
      </div>
    </>
  );
}
