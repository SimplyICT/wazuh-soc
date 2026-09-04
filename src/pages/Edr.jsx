import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString();
}

function DeployTab({ d, toast }) {
  const [deploying, setDeploying] = useState({});
  const [sshStatus, setSshStatus] = useState({});
  const [pubKey, setPubKey] = useState(null);

  useEffect(() => {
    fetch('/api/edr/public-key')
      .then(r => r.json())
      .then(d => setPubKey(d.ssh_key))
      .catch(() => {});
  }, []);

  // Check SSH status for all Linux agents
  const checkAll = async () => {
    // Get agent list from API
    const res = await fetch('/api/agents?limit=500&select=id,name,ip,os.platform,status');
    const data = await res.json();
    const agents = data?.affected_items || [];
    const linux = agents.filter(a => (a.os?.platform || '') === 'ubuntu' || (a.os?.platform || '') === 'linux');

    for (const agent of linux.slice(0, 20)) {
      try {
        const r = await fetch(`/api/edr/agent/${agent.id}/check-ssh`);
        const d = await r.json();
        setSshStatus(prev => ({ ...prev, [agent.id]: d }));
      } catch { /* skip */ }
    }
  };

  const handleDeploy = async (agentId) => {
    setDeploying(prev => ({ ...prev, [agentId]: true }));
    try {
      const res = await fetch(`/api/edr/agent/${agentId}/deploy-key`);
      const d = await res.json();
      setDeploying(prev => ({ ...prev, [agentId]: false }));
      if (d.success) {
        toast(`SSH key deployed to agent ${agentId}`, 'success');
        setSshStatus(prev => ({ ...prev, [agentId]: { success: true, host: d.ip, user: d.user } }));
      } else {
        toast(`Agent ${agentId}: key needs manual deploy`, 'info');
        setSshStatus(prev => ({ ...prev, [agentId]: d }));
      }
    } catch (e) {
      setDeploying(prev => ({ ...prev, [agentId]: false }));
      toast(`Error: ${e.message}`, 'error');
    }
  };

  const agentsList = d?.deploy_status?.agents || [];

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">SSH Key Deployment</div>
        <div className="flex gap-8">
          <button className="btn btn-sm" onClick={checkAll}>Check All</button>
        </div>
      </div>

      {pubKey && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
          <div className="text-base text-secondary" style={{ marginBottom: 4 }}>EDR Public Key — copy this to agents manually if auto-deploy fails:</div>
          <code className="text-sm" style={{ wordBreak: 'break-all' }}>{pubKey}</code>
        </div>
      )}

      <p className="text-md text-secondary" style={{ marginBottom: 12 }}>
        {d.linux_agents} Linux agents detected. Auto-deploy will try each user (root, aiagent, ubuntu, admin).
        If auto-deploy fails, run the displayed command on the agent.
      </p>

      <table>
        <thead><tr><th>Agent</th><th>IP</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {agentsList.length === 0 ? (
            <tr><td colSpan={4} className="text-secondary" style={{ textAlign: 'center' }}>
              No agent data. Use "Check All" to scan.
            </td></tr>
          ) : agentsList.map((agent, i) => {
            const status = sshStatus[agent.id];
            const isDeploying = deploying[agent.id];
            const isOk = status?.success;

            return (
              <tr key={agent.id}>
                <td><code>{agent.id}</code> {agent.name}</td>
                <td className="text-mono text-base">{agent.ip}</td>
                <td>
                  {!status ? (
                    <span className="badge badge-gray">Unknown</span>
                  ) : isOk ? (
                    <span className="badge badge-green">SSH OK ({status.user})</span>
                  ) : status.command ? (
                    <span className="badge badge-amber">Needs Key</span>
                  ) : (
                    <span className="badge badge-red">{status.error?.substring(0, 40) || 'Error'}</span>
                  )}
                </td>
                <td>
                  <button className="btn btn-sm btn-primary"
                    disabled={isDeploying || isOk}
                    onClick={() => handleDeploy(agent.id)}>
                    {isDeploying ? 'Deploying...' : isOk ? 'Connected' : 'Deploy Key'}
                  </button>
                  {status?.command && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--accent)' }}>Manual command</summary>
                      <pre style={{
                        background: 'var(--bg)', padding: 12, borderRadius: 8,
                        fontSize: 11, marginTop: 4, overflow: 'auto',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                      }}>{status.command}</pre>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Edr() {
  const r = useApi(() => fetch('/api/edr/summary').then(r => r.json()), []);
  const auditR = useApi(() => fetch('/api/edr/audit').then(r => r.json()), []);
  const agentsR = useApi(
    () => fetch('/api/agents?limit=500&select=id,name,ip,os.platform,status,version')
      .then(r => r.json())
      .then(d => d?.affected_items || d || []),
    [],
  );
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const data = r.data;
  const audit = auditR.data?.entries || [];
  const agents = agentsR.data || [];

  // Build deploy_status for the DeployTab (immutable — no mutation of r.data)
  const linuxAgents = Array.isArray(agents)
    ? agents.filter(a => (a.os?.platform || '') === 'ubuntu' || (a.os?.platform || '') === 'linux')
    : [];
  const d = { ...data, deploy_status: { agents: linuxAgents } };

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={d.total_agents} label="Total Agents" color="accent" />
        <KpiCard value={d.active_agents} label="Active" color="green" />
        <KpiCard value={d.disconnected_agents} label="Disconnected" color="red" />
        <KpiCard value={d.linux_agents} label="Linux (EDR)" color="accent" />
        <KpiCard value={d.windows_agents} label="Windows" color="blue" />
        <KpiCard value={d.ssh_reachable} label="SSH Ready" color="green" sub="key deployed" />
      </div>

      {d.isolated_count > 0 && (
        <div className="card card-border-left-red card-mb">
          <div className="card-header">
            <div className="card-title text-red">
              &#9888; Isolated Agents ({d.isolated_count})
            </div>
          </div>
          <table>
            <thead><tr><th>Agent</th><th>Isolated At</th><th>Actions</th></tr></thead>
            <tbody>
              {(d.isolated_agents || []).map((iso, i) => (
                <tr key={iso.agent_id}>
                  <td>{iso.agent_id}</td>
                  <td>{formatDate(iso.isolated_at)}</td>
                  <td>
                    <button className="btn btn-sm btn-primary"
                      onClick={() => {
                        fetch(`/api/edr/agent/${iso.agent_id}/release`, { method: 'POST' })
                          .then(res => res.json())
                          .then(() => { r.refetch(); auditR.refetch(); toast('Agent released', 'success'); })
                          .catch(e => toast(`Error: ${e.message}`, 'error'));
                      }}>
                      Release
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="tabs">
        <span className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Platform</span>
        <span className={`tab ${activeTab === 'deploy' ? 'active' : ''}`} onClick={() => setActiveTab('deploy')}>Deploy Keys</span>
        <span className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>Audit Log</span>
      </div>

      {activeTab === 'overview' && (
        <div className="cols-2">
          <div className="card">
            <div className="card-header"><div className="card-title">EDR Capabilities</div></div>
            <table><tbody>
              <tr><td>Process Listing</td><td><span className="badge badge-green">{d.ssh_reachable} agents</span></td></tr>
              <tr><td>Process Kill</td><td><span className="badge badge-green">{d.ssh_reachable} agents</span></td></tr>
              <tr><td>Network Connections</td><td><span className="badge badge-green">{d.ssh_reachable} agents</span></td></tr>
              <tr><td>Isolation</td><td><span className="badge badge-green">{d.ssh_reachable} agents</span></td></tr>
              <tr><td>File Quarantine</td><td><span className="badge badge-green">{d.ssh_reachable} agents</span></td></tr>
              <tr><td>EDR Audit Trail</td><td><span className={d.isolated_count > 0 ? 'badge badge-green' : 'badge badge-gray'}>Active</span></td></tr>
            </tbody></table>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">How EDR Works</div></div>
            <div className="text-md text-secondary" style={{ lineHeight: 1.7 }}>
              <p><strong>EDR actions</strong> execute via SSH on Linux agents with deployed keys.</p>
              <p style={{ marginTop: 8 }}><strong>Isolation</strong> uses iptables to block all non-essential traffic.</p>
              <p style={{ marginTop: 8 }}><strong>Process/network</strong> data is live via <code>ps</code> and <code>ss</code>.</p>
              <p style={{ marginTop: 8 }}><strong>Deploy Keys</strong> tab shows all Linux agents and lets you push the SSH key.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deploy' && <DeployTab d={d} toast={toast} />}

      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">EDR Action History ({audit.length})</div>
            <button className="btn btn-sm" onClick={() => auditR.refetch()}>&#8635; Refresh</button>
          </div>
          {audit.length === 0 ? (
            <div className="empty-state">No EDR actions recorded yet.</div>
          ) : (
            <table>
              <thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>
                {audit.slice().reverse().map((entry, i) => (
                  <tr key={entry.timestamp + entry.agent_id}>
                    <td className="text-base">{formatDate(entry.timestamp)}</td>
                    <td><code>{entry.agent_id}</code></td>
                    <td>
                      <span className={`badge ${
                        entry.action === 'isolate' ? 'badge-red' :
                        entry.action === 'release' ? 'badge-green' :
                        entry.action === 'quarantine' ? 'badge-amber' :
                        'badge-gray'
                      }`}>{entry.action}</span>
                    </td>
                    <td className="text-base text-secondary">
                      {entry.details ? JSON.stringify(entry.details).substring(0, 120) : '-'}
                    </td>
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
