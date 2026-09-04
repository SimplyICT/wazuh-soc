import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useRefresh } from '../components/RefreshContext';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function severityBadgeClass(severity) {
  if (severity === 'critical') return 'badge-red';
  if (severity === 'high') return 'badge-amber';
  return 'badge-gray';
}

export default function Vulnerabilities() {
  const { key: rk } = useRefresh();
  const r = useApi(() => fetch('/api/vuln/summary').then(r => r.json()), [], rk);
  const [findings, setFindings] = useState(null);
  const [sevFilter, setSevFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const toast = useToast();

  const fetchFindings = async () => {
    try {
      let url = '/api/vuln/findings';
      if (sevFilter) url += `?severity=${sevFilter}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setFindings(d);
    } catch (e) {
      toast('Failed to fetch findings: ' + e.message, 'error');
    }
  };

  const handleScan = async () => {
    try {
      toast('CVE database update started...', 'info');
      const res = await fetch('/api/vuln/update-cve', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      toast(`Fetched ${d.fetched || 0} CVEs`, 'success');
      r.refetch();
    } catch (e) {
      toast('CVE update failed: ' + e.message, 'error');
    }
  };

  const handleAgentScan = async () => {
    try {
      toast('Scanning online agents for packages...', 'info');
      const res = await fetch('/api/vuln/scan', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      toast(`Queued package scan on ${d.queued || 0} online agents`, 'success');
      setTimeout(() => { r.refetch(); fetchFindings(); }, 8000);
    } catch (e) {
      toast('Agent scan failed: ' + e.message, 'error');
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const d = r.data || {};
  const items = findings?.findings || [];

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={d.total_findings || 0} label="Vulnerabilities" color="accent" />
        <KpiCard value={d.by_severity?.critical || 0} label="Critical" color="red" />
        <KpiCard value={d.by_severity?.high || 0} label="High" color="amber" />
        <KpiCard value={d.by_severity?.medium || 0} label="Medium" color="accent" />
        <KpiCard value={d.cves_in_db || 0} label="CVEs in DB" color="green" sub="last 60 days" />
        <KpiCard value={d.agents_scanned || 0} label="Agents Scanned" color="green" />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Vulnerability Findings ({items.length || d.total_findings || 0})</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 12, outline: 'none' }}>
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button className="btn btn-sm btn-primary" onClick={fetchFindings}>Query</button>
            <button className="btn btn-sm" onClick={handleScan}>Update CVEs</button>
            <button className="btn btn-sm btn-primary" onClick={handleAgentScan}>Scan Agents</button>
          </div>
        </div>

        {items.length === 0 && findings === null && (
          <div className="empty-state">
            <p style={{ marginBottom: 12 }}>No vulnerability data yet.</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              1. Click "Update CVEs" to fetch the latest CVE database (NVD API)
              <br />
              2. Deploy agents and collect package inventory
              <br />
              3. Run a scan to match packages against CVEs
            </p>
          </div>
        )}

        {items.length === 0 && findings !== null && (
          <div className="empty-state">No findings match your filters. Run an agent scan first.</div>
        )}

        {items.length > 0 && (
          <div className="table-container" style={{ maxHeight: 500, overflow: 'auto' }}>
            <table>
              <thead><tr style={{ position: 'sticky', top: 0, background: 'var(--card-bg)' }}>
                <th>CVE</th><th>Severity</th><th>Score</th><th>Package</th><th>Installed</th><th>Agent</th><th>Description</th>
              </tr></thead>
              <tbody>
                {items.map((f, i) => (
                  <tr key={f.cve_id} style={{ cursor: 'pointer' }} onClick={() => setDetail(detail?.cve_id === f.cve_id ? null : f)}>
                    <td><code style={{ fontSize: 11 }}>{f.cve_id}</code></td>
                    <td><span className={`badge ${severityBadgeClass(f.severity)}`} style={{ fontSize: 10 }}>{f.severity}</span></td>
                    <td style={{ fontSize: 12 }}>{f.score || '-'}</td>
                    <td style={{ fontSize: 12 }}>{f.package_name}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.package_version}</td>
                    <td style={{ fontSize: 11 }}>{f.agent_id}</td>
                    <td style={{ fontSize: 11, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description?.substring(0, 80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">{detail.cve_id}</div>
            <button className="btn btn-sm" onClick={() => setDetail(null)}>Close</button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <p><strong>Package:</strong> {detail.package_name} ({detail.package_version})</p>
            <p><strong>Severity:</strong> {detail.severity} (CVSS: {detail.score})</p>
            <p><strong>Published:</strong> {detail.published}</p>
            <p><strong>Description:</strong> {detail.description}</p>
            <p><strong>Agent:</strong> {detail.agent_id}</p>
            <p style={{ marginTop: 8 }}>
              <a href={`https://nvd.nist.gov/vuln/detail/${detail.cve_id}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                View on NVD
              </a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
