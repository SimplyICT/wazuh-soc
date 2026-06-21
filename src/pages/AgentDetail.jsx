import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { apiGet, apiPut } from '../api/wazuhApi';
import StatusBadge from '../components/StatusBadge';
import SeverityBadge from '../components/SeverityBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { useToast } from '../context/ToastContext';

const TABS = ['overview', 'sca', 'fim', 'vulnerabilities', 'inventory'];

export default function AgentDetail() {
  const { id } = useParams();
  const r = useApi(() => apiGet(`/agents/${id}`), [id]);
  const [tab, setTab] = useState('overview');
  const toast = useToast();

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const agent = r.data.affected_items ? r.data.affected_items[0] : r.data;
  const os = agent.os || {};

  const handleRestart = () => {
    apiPut(`/agents/${id}/restart`)
      .then(() => toast(`Agent ${id} restarted`, 'success'))
      .catch(e => toast(`Failed: ${e.message}`, 'error'));
  };

  const handleScan = () => {
    apiPut(`/agents/${id}/scan/syscheck`)
      .then(() => toast(`Syscheck triggered for ${id}`, 'success'))
      .catch(e => toast(`Failed: ${e.message}`, 'error'));
  };

  return (
    <>
      <div className="detail-header">
        <div className="detail-info">
          <div className="detail-name">{agent.name}</div>
          <div className="detail-meta">
            <span>ID: {agent.id}</span>
            <span>IP: {agent.ip}</span>
            <span>OS: {os.name || 'Unknown'} {os.version || ''}</span>
            <StatusBadge status={agent.status} />
            <span>v{agent.version || '-'}</span>
          </div>
        </div>
        <div className="detail-actions">
          <button className="btn btn-primary" onClick={handleRestart}>Restart</button>
          <button className="btn btn-amber" onClick={handleScan}>Syscheck</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <span key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </span>
        ))}
      </div>

      <TabContent agent={agent} tab={tab} id={id} />
    </>
  );
}

function TabContent({ agent, tab, id }) {
  const os = agent.os || {};

  if (tab === 'overview') {
    return (
      <div className="cols-2">
        <div className="card">
          <div className="card-header"><div className="card-title">Hardware & OS</div></div>
          <table><tbody>
            <tr><td>Hostname</td><td>{agent.name}</td></tr>
            <tr><td>OS</td><td>{os.name || '-'}</td></tr>
            <tr><td>Version</td><td>{os.version || '-'}</td></tr>
            <tr><td>Platform</td><td>{os.platform || '-'}</td></tr>
            <tr><td>Architecture</td><td>{os.arch || '-'}</td></tr>
            <tr><td>IP</td><td>{agent.ip}</td></tr>
            <tr><td>Manager</td><td>{agent.manager || '-'}</td></tr>
            <tr><td>Last Seen</td><td>{agent.lastKeepAlive ? new Date(agent.lastKeepAlive).toLocaleString() : '-'}</td></tr>
            <tr><td>Registered</td><td>{agent.dateAdd ? new Date(agent.dateAdd).toLocaleString() : '-'}</td></tr>
            <tr><td>Groups</td><td>{(agent.group || []).map(g => <span key={g} className="group-badge">{g}</span>) || '-'}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Status</div></div>
          <table><tbody>
            <tr><td>Status</td><td><StatusBadge status={agent.status} /></td></tr>
            <tr><td>Config Status</td><td>{agent.group_config_status || '-'}</td></tr>
            <tr><td>Node</td><td>{agent.node_name || '-'}</td></tr>
          </tbody></table>
        </div>
      </div>
    );
  }

  return <AgentTabPanel tab={tab} id={id} />;
}

function AgentTabPanel({ tab, id }) {
  // Always call useApi unconditionally to obey Rules of Hooks.
  // For inventory, the result is unused (InventoryPanel handles data separately).
  const r = useApi(() => {
    if (tab === 'inventory') return Promise.resolve({ affected_items: [] });
    return apiGet(`/agents/${id}/${tab}?limit=100`);
  }, [id, tab]);

  if (tab === 'sca') {
    if (r.loading) return <LoadingSpinner />;
    if (r.error) return <ErrorState message={r.error.message} />;
    const items = r.data.affected_items || [];
    return (
      <div className="card">
        <div className="table-container">
          <table><thead><tr><th>Policy</th><th>Score</th><th>Passed</th><th>Failed</th></tr></thead>
            <tbody>
              {items.map((p, i) => (
                <tr key={i}>
                  <td>{p.name || p.policy_id}</td>
                  <td className={p.score >= 80 ? 'text-green' : p.score >= 50 ? 'text-amber' : 'text-red'}>{p.score != null ? `${p.score}%` : '-'}</td>
                  <td>{p.passed || 0}</td>
                  <td>{p.failed || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === 'fim') {
    if (r.loading) return <LoadingSpinner />;
    if (r.error) return <ErrorState message={r.error.message} />;
    const items = r.data.affected_items || [];
    return (
      <div className="card">
        <div className="table-container">
          <table><thead><tr><th>File</th><th>Event</th><th>Date</th></tr></thead>
            <tbody>
              {items.map((f, i) => (
                <tr key={i}><td>{f.file || f.path || '-'}</td><td>{f.type || f.event || '-'}</td><td>{f.date || f.mtime ? new Date(f.date || f.mtime).toLocaleString() : '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === 'vulnerabilities') {
    if (r.loading) return <LoadingSpinner />;
    if (r.error) return <ErrorState message={r.error.message} />;
    const items = r.data.affected_items || [];
    return (
      <div className="card">
        <div className="table-container">
          <table><thead><tr><th>CVE</th><th>Package</th><th>Severity</th><th>CVSS</th><th>Status</th><th>Title</th></tr></thead>
            <tbody>
              {items.map((v, i) => (
                <tr key={i}><td>{v.cve || '-'}</td><td>{v.package?.name || '-'}</td><td><SeverityBadge severity={v.severity} /></td><td>{v.cvss_score || '-'}</td><td>{v.status || '-'}</td><td>{(v.title || '').substring(0, 50)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === 'inventory') {
    return <InventoryPanel id={id} />;
  }

  return null;
}

function InventoryPanel({ id }) {
  const pkg = useApi(() => apiGet(`/agents/${id}/packages?limit=50`), [id]);
  const ports = useApi(() => apiGet(`/agents/${id}/ports?limit=50`), [id]);

  return (
    <div className="cols-2">
      <div className="card">
        <div className="card-header"><div className="card-title">Packages</div></div>
        {pkg.loading ? <LoadingSpinner /> : pkg.error ? <ErrorState message={pkg.error.message} /> : (
          <table><tbody>{(pkg.data?.affected_items || []).slice(0, 20).map((p, i) => (
            <tr key={i}><td>{p.name}</td><td>{p.version}</td></tr>
          ))}</tbody></table>
        )}
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Open Ports</div></div>
        {ports.loading ? <LoadingSpinner /> : ports.error ? <ErrorState message={ports.error.message} /> : (
          <table><tbody>{(ports.data?.affected_items || []).slice(0, 20).map((p, i) => (
            <tr key={i}><td>{p.local_ip || '-'}:{p.local_port}</td><td>{p.protocol || '-'}</td><td>{p.state || '-'}</td></tr>
          ))}</tbody></table>
        )}
      </div>
    </div>
  );
}
