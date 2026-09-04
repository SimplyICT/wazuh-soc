import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';

import ProcessTable from '../components/ProcessTable';
import ProcessTree from '../components/ProcessTree';
import PersistenceTable from '../components/PersistenceTable';
import NetworkConnections from '../components/NetworkConnections';
import ErrorState from '../components/ErrorState';
import IsolationBanner from '../components/IsolationBanner';
import ErrorBoundary from '../components/ErrorBoundary';

const PLATFORM_ICONS = { windows: '\uD83D\uFDB5', macos: '\uD83D\uFDB5', linux: '\uD83D\uDCBB', ios: '\uD83D\uDCF1', android: '\uD83D\uDCF1' };

function fmtTime(d) { if (!d) return '-'; try { return new Date(d).toLocaleString(); } catch { return d; } }

function AgentOverview({ agentId }) {
  const tel = useApi(() => fetch(`/api/agents/${agentId}/telemetry`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }), [agentId]);
  const allAgents = useApi(() => fetch('/api/agents/all').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }), []);

  if (tel.loading || allAgents.loading) return <LoadingSpinner />;
  if (tel.error) return <ErrorState message={tel.error.message} onRetry={tel.refetch} />;
  if (allAgents.error) return <ErrorState message={allAgents.error.message} onRetry={allAgents.refetch} />;

  // Find agent in our list
  const agentsList = allAgents.data?.agents || [];
  const agentInfo = agentsList.find(a => a.id === agentId);
  const telemetry = tel.data?.data || {};
  const sysInfo = telemetry?.data?.system || {};

  const isOurAgent = !!agentInfo;

  // Platform icon
  const platform = isOurAgent ? agentInfo.platform : 'unknown';
  const icon = PLATFORM_ICONS[platform] || '\u2753';
  const status = isOurAgent ? agentInfo.status : 'unknown';

  return (
    <div className="cols-2">
      <div className="card">
        <div className="card-header"><div className="card-title">Agent Info</div></div>
        {!isOurAgent ? (
          <div className="empty-state" style={{ padding: 20 }}>
            <div style={{ fontSize: 16, marginBottom: 8 }}>{icon} Unknown Agent</div>
            <p className="text-md text-secondary">
              This agent ID is not found in our system. It may be a legacy agent.
            </p>
            <a className="btn btn-sm" href="#/our-agents" style={{ marginTop: 8 }}>View Our Agents</a>
          </div>
        ) : (
          <table><tbody>
            <tr><td>Status</td><td><span className={`badge ${status === 'online' ? 'badge-green' : 'badge-gray'}`}>{status}</span></td></tr>
            <tr><td>Platform</td><td>{icon} {platform}</td></tr>
            <tr><td>Hostname</td><td className="text-mono">{agentInfo.hostname || '-'}</td></tr>
            <tr><td>Version</td><td>{agentInfo.version || '-'}</td></tr>
            <tr><td>Last Seen</td><td>{fmtTime(agentInfo.last_seen)}</td></tr>
            <tr><td>Connection</td><td>WebSocket {status === 'online' ? '(connected)' : '(disconnected)'}</td></tr>
            <tr><td>OS</td><td>{sysInfo?.os_name || '-'}</td></tr>
            <tr><td>Architecture</td><td>{sysInfo.arch || '-'}</td></tr>
          </tbody></table>
        )}
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Capabilities</div></div>
        <table><tbody>
          <tr><td>Process Listing</td><td><span className="badge badge-green">Available</span></td></tr>
          <tr><td>Process Tree</td><td><span className="badge badge-green">Available</span></td></tr>
          <tr><td>Persistence Detection</td><td><span className="badge badge-green">Available</span></td></tr>
          <tr><td>Network Connections</td><td><span className="badge badge-green">Available</span></td></tr>
          <tr><td>Isolation</td><td><span className="badge badge-green">Available</span></td></tr>
          <tr><td>File Quarantine</td><td><span className="badge badge-green">Available</span></td></tr>
          <tr><td>FIM</td><td><span className="badge badge-gray">Coming Soon</span></td></tr>
          <tr><td>Vulnerability Scan</td><td><span className="badge badge-gray">Coming Soon</span></td></tr>
          <tr><td>Config Audit (SCA)</td><td><span className="badge badge-gray">Coming Soon</span></td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

function EdrPanel({ id }) {
  const [edrTab, setEdrTab] = useState('processes');
  return (
    <>
      <ErrorBoundary><IsolationBanner agentId={id} /></ErrorBoundary>
      <div className="tabs">
        <span className={`tab ${edrTab === 'processes' ? 'active' : ''}`} onClick={() => setEdrTab('processes')}>Process Tree</span>
        <span className={`tab ${edrTab === 'flat' ? 'active' : ''}`} onClick={() => setEdrTab('flat')}>Flat List</span>
        <span className={`tab ${edrTab === 'persistence' ? 'active' : ''}`} onClick={() => setEdrTab('persistence')}>Persistence</span>
        <span className={`tab ${edrTab === 'network' ? 'active' : ''}`} onClick={() => setEdrTab('network')}>Network</span>
        <span className={`tab ${edrTab === 'quarantine' ? 'active' : ''}`} onClick={() => setEdrTab('quarantine')}>Quarantine</span>
      </div>
      {edrTab === 'processes' && <ErrorBoundary><ProcessTree agentId={id} /></ErrorBoundary>}
      {edrTab === 'flat' && <ErrorBoundary><ProcessTable agentId={id} /></ErrorBoundary>}
      {edrTab === 'persistence' && <ErrorBoundary><PersistenceTable agentId={id} /></ErrorBoundary>}
      {edrTab === 'network' && <ErrorBoundary><NetworkConnections agentId={id} /></ErrorBoundary>}
      {edrTab === 'quarantine' && (
        <div className="card">
          <div className="card-header"><div className="card-title">Quarantine a File</div></div>
          <div className="text-md text-secondary">
            <p>To quarantine a suspicious file, provide the full path on the endpoint.</p>
            <p style={{ marginTop: 8 }}>Example: <code>/tmp/suspicious.sh</code> or <code>C:\Users\user\bad.exe</code></p>
          </div>
        </div>
      )}
    </>
  );
}

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');

  return (
    <>
      <div className="flex gap-8" style={{ marginBottom: 16 }}>
        <button className="btn" onClick={() => navigate(-1)}>&#9664; Back</button>
      </div>
      <div className="tabs">
        <span className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</span>
        <span className={`tab ${tab === 'edr' ? 'active' : ''}`} onClick={() => setTab('edr')}>EDR</span>
      </div>
      {tab === 'overview' && <AgentOverview agentId={id} />}
      {tab === 'edr' && <EdrPanel id={id} />}
    </>
  );
}
