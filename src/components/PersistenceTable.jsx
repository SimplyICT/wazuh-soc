import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from './LoadingSpinner';
import ErrorState from './ErrorState';

const TYPE_LABELS = {
  cron: 'Cron Job',
  systemd_user: 'Systemd (User)',
  systemd_system: 'Systemd (System)',
  bashrc: 'Shell RC',
  ssh_keys: 'SSH Keys',
  at_jobs: 'At Job',
  init_d: 'Init Script',
};

const TYPE_COLORS = {
  cron: 'badge-accent',
  systemd_user: 'badge-green',
  systemd_system: 'badge-green',
  bashrc: 'badge-gray',
  ssh_keys: 'badge-amber',
  at_jobs: 'badge-gray',
  init_d: 'badge-gray',
};

// Flag a persistence entry as suspicious based on its content.
// Detection criteria by persistence type:
//   cron          — remote downloaders (curl/wget), inline script execution
//                   (bash -c, python3 -c), base64-encoded payloads, file
//                   permission changes (chmod +x), reverse shell over TCP (/dev/tcp)
//   systemd       — units referencing suspicious paths ("evil", "malware",
//                   "unknown") or writing to /tmp (common temp-dropper pattern)
//   bashrc        — same remote-access patterns as cron, plus netcat (nc/ncat)
//                   and alias hijacking (redirecting everyday commands)
function isSuspicious(entry) {
  const lower = (entry.content || '').toLowerCase();
  if (entry.type === 'cron') {
    const bad = ['curl', 'wget', 'bash -c', 'python3 -c', 'base64', 'chmod +x', '/dev/tcp'];
    return bad.some(k => lower.includes(k));
  }
  if (entry.type === 'systemd_user' || entry.type === 'systemd_system') {
    const bad = ['evil', 'malware', 'unknown', 'tmp'];
    return bad.some(k => lower.includes(k));
  }
  if (entry.type === 'bashrc') {
    const bad = ['curl', 'wget', 'nc ', 'ncat', 'chmod +x', '/dev/tcp', 'alias'];
    return bad.some(k => lower.includes(k));
  }
  return false;
}

export default function PersistenceTable({ agentId }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const r = useApi(() => fetch(`/api/edr/agent/${agentId}/persistence`).then(r => r.json()), [agentId]);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const entries = r.data?.entries || [];
  if (!entries.length) {
    return (
      <div className="card">
        <div className="card-header"><div className="card-title">Persistence Mechanisms</div></div>
        <div className="empty-state">{r.data?.error || 'No persistence data available.'}</div>
      </div>
    );
  }

  const types = [...new Set(entries.map(e => e.type))];
  const filtered = typeFilter === 'all' ? entries : entries.filter(e => e.type === typeFilter);
  const suspicious = entries.filter(e => isSuspicious(e));

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Persistence Mechanisms ({entries.length})</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--amber)' }}>{suspicious.length > 0 && `⚠ ${suspicious.length} suspicious`}</span>
        </div>
      </div>
      <div className="filter-tabs" style={{ marginBottom: 8 }}>
        <span className={`filter-tab ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>All</span>
        {types.map(t => (
          <span key={t} className={`filter-tab ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
            {TYPE_LABELS[t] || t} ({entries.filter(e => e.type === t).length})
          </span>
        ))}
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Content</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={e.type + e.content + e.user} style={isSuspicious(e) ? { background: 'rgba(255,71,87,0.05)' } : {}}>
                <td><span className={`badge ${TYPE_COLORS[e.type] || 'badge-gray'}`}>{TYPE_LABELS[e.type] || e.type}</span></td>
                <td style={{
                  fontSize: 12, fontFamily: 'monospace', maxWidth: 400, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: isSuspicious(e) ? 'var(--red)' : 'inherit',
                }}>{e.content}</td>
                <td style={{ fontSize: 11 }}>{e.user}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
