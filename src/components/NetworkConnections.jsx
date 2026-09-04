import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from './LoadingSpinner';
import ErrorState from './ErrorState';

export default function NetworkConnections({ agentId }) {
  const [filter, setFilter] = useState('all');
  const r = useApi(
    () => fetch(`/api/edr/agent/${agentId}/network`).then(res => res.json()),
    [agentId],
  );

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  let connections = r.data?.connections || [];
  if (!connections.length) {
    return (
      <div className="card">
        <div className="card-header"><div className="card-title">Network Connections</div></div>
        <div className="empty-state">
          {r.data?.error ? `Error: ${r.data.error}` : 'No connection data available.'}
        </div>
      </div>
    );
  }

  // Deduplicate and parse
  const splitHostPort = (addr) => {
    if (!addr) return { host: '', port: '' };
    // IPv6 bracket notation: [::1]:8080 or [fe80::1%eth0]:8080
    const bracketMatch = addr.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (bracketMatch) return { host: `[${bracketMatch[1]}]`, port: bracketMatch[2] || '' };
    // IPv4 or hostname:port — split at the LAST colon to handle port
    const lastColon = addr.lastIndexOf(':');
    if (lastColon > 0) {
      return { host: addr.substring(0, lastColon), port: addr.substring(lastColon + 1) };
    }
    return { host: addr, port: '' };
  };
  const parsed = connections.map(c => {
    const local = splitHostPort(c.local || '');
    const peer = splitHostPort(c.peer || '');
    return {
      ...c,
      localPort: local.port,
      localHost: local.host,
      peerPort: peer.port,
      peerHost: peer.host,
    };
  });

  const filtered = filter === 'all'
    ? parsed
    : parsed.filter(c => (c.state || '').toLowerCase() === filter);

  const listening = parsed.filter(c => (c.state || '').toLowerCase() === 'listen').length;
  const established = parsed.filter(c => (c.state || '').toLowerCase() === 'estab').length;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Network Connections ({connections.length})</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
          <span>Listening: <strong style={{ color: 'var(--accent)' }}>{listening}</strong></span>
          <span>Established: <strong style={{ color: 'var(--green)' }}>{established}</strong></span>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontSize: 12, outline: 'none' }}
          >
            <option value="all">All</option>
            <option value="listen">Listening</option>
            <option value="estab">Established</option>
            <option value="time_wait">Time Wait</option>
            <option value="close_wait">Close Wait</option>
          </select>
        </div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Proto</th>
              <th>Local Address</th>
              <th>Peer Address</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((c, i) => (
              <tr key={c.localHost + c.localPort + c.peerHost + c.peerPort + c.protocol}>
                <td><code>{c.protocol || '-'}</code></td>
                <td style={{ fontSize: 12 }}>{c.localHost}:<strong>{c.localPort}</strong></td>
                <td style={{ fontSize: 12 }}>{c.peerHost}:<strong>{c.peerPort}</strong></td>
                <td>
                  <span className={`badge ${
                    (c.state || '').toLowerCase() === 'listen' ? 'badge-accent' :
                    (c.state || '').toLowerCase() === 'estab' ? 'badge-green' :
                    'badge-gray'
                  }`}>{c.state || '-'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
