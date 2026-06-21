import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function AlertDetail() {
  const { id } = useParams();
  const [alert, setAlert] = useState(null);
  const [remediation, setRemediation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/wazuh-api/events?size=1').then(r => r.json()).then(d => d.data || d).catch(() => null),
      fetch('http://127.0.0.1:8000/api/v1/remediation/suggest/' + id, {
        headers: { 'x-api-key': 'mission-test-key-123' },
      }).then(r => r.json()).catch(() => null),
    ]).then(([ev, rem]) => {
      const items = ev?.affected_items || [];
      setAlert(items[0] || {});
      setRemediation(rem);
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading"><div className="loading-spinner"></div><div style={{ marginTop: 12 }}>Loading...</div></div>;
  if (error) return <div className="error-state">{error}<br /><button className="btn" onClick={() => window.location.reload()}>Retry</button></div>;

  const a = alert || {};
  const ruleLevel = a.rule?.level || 0;
  const sev = ruleLevel >= 12 ? 'critical' : ruleLevel >= 8 ? 'high' : ruleLevel >= 5 ? 'medium' : 'low';
  const sevMap = { critical: 'severity-critical', high: 'severity-high', medium: 'severity-medium', low: 'severity-low' };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={() => window.history.back()}>&#9664; Back</button>
      </div>
      <div className="cols-2">
        <div className="card">
          <div className="card-header"><div className="card-title">Alert Details</div></div>
          <table><tbody>
            <tr><td>ID</td><td style={{ fontFamily: 'monospace' }}>{id}</td></tr>
            <tr><td>Severity</td><td><span className={`badge ${sevMap[sev]}`}>{sev}</span></td></tr>
            <tr><td>Rule</td><td>{a.rule ? (a.rule.description || a.rule.id || '') : '-'}</td></tr>
            <tr><td>Agent</td><td>{a.agent ? (a.agent.name || a.agent.id || '') : '-'}</td></tr>
            <tr><td>Timestamp</td><td>{a.timestamp ? new Date(a.timestamp).toLocaleString() : '-'}</td></tr>
            <tr><td>Location</td><td>{a.location || '-'}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Remediation</div></div>
          {remediation?.suggested_actions?.length ? (
            <table><thead><tr><th>Action</th><th>Detail</th></tr></thead>
              <tbody>{remediation.suggested_actions.map((act, i) => (
                <tr key={i}><td><span className="badge badge-accent">{act.action}</span></td><td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{act.detail || ''}</td></tr>
              ))}</tbody>
            </table>
          ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No remediation suggestions available.</div>}
          {remediation?.device && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Device</div>
              <table><tbody>
                <tr><td>IP</td><td style={{ fontFamily: 'monospace' }}>{remediation.device.ip || '-'}</td></tr>
                <tr><td>Hostname</td><td>{remediation.device.hostname || '-'}</td></tr>
                <tr><td>Type</td><td>{remediation.device.device_type || '-'}</td></tr>
                <tr><td>Status</td><td><span className={`badge ${remediation.device.status === 'ONLINE' ? 'badge-green' : 'badge-red'}`}>{remediation.device.status || '-'}</span></td></tr>
              </tbody></table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
