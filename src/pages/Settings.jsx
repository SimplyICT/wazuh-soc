import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

export default function Settings() {
  const r = useApi(() => fetch('/api/settings').then(r => r.json()), []);
  const toast = useToast();
  const [activeSection, setActiveSection] = useState('integrations');
  const [localEdits, setLocalEdits] = useState({});
  const [saving, setSaving] = useState({});
  const [vtResult, setVtResult] = useState(null);
  const [vtHash, setVtHash] = useState('');

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const settings = r.data || {};
  const integrations = settings.integrations || {};

  const saveIntegration = async (name, config) => {
    setSaving(prev => ({ ...prev, [name]: true }));
    try {
      const res = await fetch(`/api/settings/integrations/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaving(prev => ({ ...prev, [name]: false }));
      toast('Saved', 'success');
      r.refetch();
    } catch (e) {
      setSaving(prev => ({ ...prev, [name]: false }));
      toast(`Save failed: ${e.message}`, 'error');
    }
  };

  const handleVTlookup = async () => {
    if (!vtHash.trim()) return;
    try {
      const res = await fetch(`/api/tools/virustotal/${vtHash.trim()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setVtResult(data);
    } catch (e) {
      toast(`Lookup failed: ${e.message}`, 'error');
    }
  };

  return (
    <>
      <div className="tabs">
        <span className={`tab ${activeSection === 'integrations' ? 'active' : ''}`} onClick={() => setActiveSection('integrations')}>Integrations</span>
        <span className={`tab ${activeSection === 'general' ? 'active' : ''}`} onClick={() => setActiveSection('general')}>General</span>
        <span className={`tab ${activeSection === 'virustotal' ? 'active' : ''}`} onClick={() => setActiveSection('virustotal')}>VirusTotal Lookup</span>
      </div>

      {activeSection === 'integrations' && (
        <div className="flex-col gap-10">
          {Object.entries(integrations).map(([name, cfg]) => (
            <div key={name} className="card">
              <div className="card-header">
                <div className="card-title" style={{ textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</div>
                <span className={`badge ${cfg.enabled ? 'badge-green' : 'badge-gray'}`}>
                  {cfg.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-base text-secondary" style={{ marginBottom: 8 }}>{cfg.description}</p>
              {name === 'virustotal' && (
                <div className="flex gap-8 items-center">
                  <input value={localEdits[`${name}_api_key`] ?? cfg.api_key}
                    onChange={e => setLocalEdits(prev => ({ ...prev, [`${name}_api_key`]: e.target.value }))}
                    onBlur={() => {
                      if (localEdits[`${name}_api_key`] !== undefined) {
                        saveIntegration(name, { ...cfg, api_key: localEdits[`${name}_api_key`] });
                        setLocalEdits(prev => { const { [`${name}_api_key`]: _, ...rest } = prev; return rest; });
                      }
                    }}
                    placeholder="API Key" type="password"
                    className="input" style={{ fontSize: 12 }} />
                  <button className="btn btn-sm btn-primary" disabled={saving[name]}
                    onClick={() => saveIntegration(name, { ...cfg, enabled: !cfg.enabled, api_key: cfg.api_key })}>
                    {cfg.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              )}
              {name === 'slack' && (
                <>
                  <div className="flex gap-8 items-center">
                    <input value={localEdits[`${name}_webhook`] ?? cfg.webhook_url}
                      onChange={e => setLocalEdits(prev => ({ ...prev, [`${name}_webhook`]: e.target.value }))}
                      onBlur={() => {
                        if (localEdits[`${name}_webhook`] !== undefined) {
                          saveIntegration(name, { ...cfg, webhook_url: localEdits[`${name}_webhook`] });
                          setLocalEdits(prev => { const { [`${name}_webhook`]: _, ...rest } = prev; return rest; });
                        }
                      }}
                      placeholder="https://hooks.slack.com/services/..." type="password"
                      className="input" style={{ fontSize: 12 }} />
                    <button className="btn btn-sm btn-primary" disabled={saving[name]}
                      onClick={() => saveIntegration(name, { ...cfg, enabled: !cfg.enabled, webhook_url: cfg.webhook_url })}>
                      {cfg.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                  <div className="text-base text-secondary">
                    <button className="btn btn-sm" style={{ marginLeft: 8 }}
                      onClick={() => saveIntegration(name, { ...cfg, enabled: !cfg.enabled })}>
                      Toggle
                    </button>
                  </div>
                </>
              )}
              {name === 'syslog_server' && (
                <div className="text-base text-secondary">
                  <span>Port: <code>{cfg.port || 'not set'}</code></span>
                  <button className="btn btn-sm" style={{ marginLeft: 8 }}
                    onClick={() => saveIntegration(name, { ...cfg, enabled: !cfg.enabled })}>
                    Toggle
                  </button>
                </div>
              )}
              {name === 'misp' && (
                <div className="text-base text-secondary">
                  <span>URL: <code>{cfg.url || 'not set'}</code></span>
                  <button className="btn btn-sm" style={{ marginLeft: 8 }}
                    onClick={() => saveIntegration(name, { ...cfg, enabled: !cfg.enabled })}>
                    Toggle
                  </button>
                </div>
              )}
              {name === 'telegram' && (
                <div className="text-base text-secondary">
                  <span>Configured: {cfg.bot_token ? 'Yes' : 'No'}</span>
                </div>
              )}
              {name === 'm365_itdr' && (
                <div className="text-base text-secondary" style={{ lineHeight: 1.7 }}>
                  <div>Tenant: <code>{cfg.tenant_id || '(not set)'}</code></div>
                  <div>Client: <code>{cfg.client_id || '(not set)'}</code></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeSection === 'general' && (
        <div className="card">
          <div className="card-header"><div className="card-title">General Settings</div></div>
          <table><tbody>
            <tr><td>Organization</td><td>{settings.organization?.name || '-'}</td></tr>
            <tr><td>Timezone</td><td>{settings.organization?.timezone || 'UTC'}</td></tr>
            <tr><td>Data Retention</td><td>{settings.organization?.retention_days || 90} days</td></tr>
            <tr><td>SIEM Max Logs</td><td>{settings.siem?.max_logs || 20000}</td></tr>
            <tr><td>Critical Alerts</td><td>{settings.notifications?.critical_alerts ? 'On' : 'Off'}</td></tr>
            <tr><td>Daily Digest</td><td>{settings.notifications?.daily_digest ? 'On' : 'Off'}</td></tr>
          </tbody></table>
        </div>
      )}

      {activeSection === 'virustotal' && (
        <div className="card">
          <div className="card-header"><div className="card-title">VirusTotal Hash Lookup</div></div>
          <div className="flex gap-8" style={{ marginBottom: 12 }}>
            <input value={vtHash} onChange={e => setVtHash(e.target.value)}
              placeholder="SHA256 hash to check..."
              className="input-flex" />
            <button className="btn btn-sm btn-primary" disabled={!vtHash.trim()} onClick={handleVTlookup}>Lookup</button>
          </div>
          {vtResult && (
            <div>
              {vtResult.error ? (
                <div className="text-md text-amber">{vtResult.error}</div>
              ) : (
                <table>
                  <thead><tr><th>Metric</th><th>Value</th></tr></thead>
                  <tbody>
                    <tr><td>Hash</td><td><code style={{ fontSize: 11 }}>{vtResult.hash}</code></td></tr>
                    <tr><td>Status</td><td><span className={`badge ${vtResult.detected ? 'badge-red' : 'badge-green'}`}>{vtResult.detected ? 'MALICIOUS' : 'Clean'}</span></td></tr>
                    <tr><td>Malicious</td><td><span className="text-red" style={{ fontWeight: 600 }}>{vtResult.malicious}</span></td></tr>
                    <tr><td>Suspicious</td><td>{vtResult.suspicious}</td></tr>
                    <tr><td>Undetected</td><td>{vtResult.undetected}</td></tr>
                    <tr><td>Type</td><td>{vtResult.type || '-'}</td></tr>
                    <tr><td>File Name</td><td>{vtResult.meaningful_name || vtResult.names?.join(', ') || '-'}</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
          {!vtResult && !settings.integrations?.virustotal?.enabled && (
            <div className="text-base text-secondary">
              VirusTotal not configured. Add your API key in the Integrations tab.
            </div>
          )}
        </div>
      )}
    </>
  );
}
