import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useSocMutation } from '../hooks/useMutation';
import LoadingSpinner from './LoadingSpinner';
import ErrorState from './ErrorState';
import { useToast } from '../context/ToastContext';

function indentStyle(depth) {
  return { paddingLeft: depth * 24 + 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 };
}

function cpuColor(cpu) {
  const v = parseFloat(cpu);
  if (v > 50) return 'var(--red)';
  if (v > 20) return 'var(--amber)';
  return 'inherit';
}

function CmdLabel({ cmd, pid }) {
  // Suspicious process detection: match command names commonly associated with
  // reverse shells, cryptominers, droppers, and remote-access tools.
  //   python3 / perl  — script interpreters abused for in-memory payloads
  //   bash / sh       — interactive shells (often piped from curl/wget)
  //   nc / ncat       — netcat: raw TCP reverse shell / bind shell
  //   crypt / miner / xmrig — cryptocurrency mining software
  //   curl / wget     — remote payload downloaders / C2 communication
  const suspicious = ['python3', 'perl', 'bash', 'sh ', 'nc ', 'ncat', 'crypt', 'miner', 'xmrig', 'curl', 'wget'].some(k => lower.includes(k));
  return (
    <span style={{ color: suspicious ? 'var(--red)' : 'inherit', fontWeight: suspicious ? 700 : 400 }}>
      {cmd || '?'}
      {suspicious && <span title="Potentially suspicious command" style={{ marginLeft: 4 }}>&#9888;</span>}
    </span>
  );
}

const ProcessRow = React.memo(function ProcessRow({ p, onKill, killing }) {
  const [expanded, setExpanded] = useState(true);
  const toggle = () => setExpanded(e => !e);

  return (
    <>
      <div style={indentStyle(p.depth)}>
        {p.has_children ? (
          <span onClick={toggle} style={{ cursor: 'pointer', width: 14, textAlign: 'center', userSelect: 'none', color: 'var(--text-secondary)' }}>
            {expanded ? '▼' : '▶'}
          </span>
        ) : <span style={{ width: 14 }} />}
        <code style={{ width: 50, fontSize: 11, color: 'var(--text-secondary)' }}>{p.pid}</code>
        <span style={{ width: 40, fontSize: 11, color: cpuColor(p.cpu) }}>{p.cpu}%</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <CmdLabel cmd={p.command} pid={p.pid} />
        </span>
        <button className="btn btn-sm"
          style={{ fontSize: 10, padding: '1px 6px', visibility: p.pid === '1' ? 'hidden' : 'visible' }}
          disabled={killing}
          onClick={() => { if (confirm(`Kill PID ${p.pid}?`)) onKill(p.pid); }}>
          Kill
        </button>
      </div>
      {expanded && p.children?.map(child => (
        <ProcessRow key={child.pid} p={child} onKill={onKill} killing={killing} />
      ))}
    </>
  );
});

export default function ProcessTree({ agentId }) {
  const [search, setSearch] = useState('');
  const [flatMode, setFlatMode] = useState(false);
  const toast = useToast();

  const r = useApi(() => fetch(`/api/edr/agent/${agentId}/process-tree`).then(r => r.json()), [agentId]);
  const killMut = useSocMutation(
    async (pid) => {
      const res = await fetch(`/api/edr/agent/${agentId}/kill`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      });
      return res.json();
    },
    { invalidateKeys: ['api/edr/agent/'], onSuccess: () => toast('Process killed', 'success'), onError: (e) => toast(`Failed: ${e.message}`, 'error') },
  );

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const tree = r.data?.tree || [];
  if (!tree.length) {
    return <div className="card"><div className="empty-state">{r.data?.error || 'No process data'}</div></div>;
  }

  // Build parent-child links for tree rendering
  const byPid = {};
  tree.forEach(p => { byPid[p.pid] = { ...p, children: [] }; });
  const roots = [];
  tree.forEach(p => {
    const node = byPid[p.pid];
    if (node && node.ppid && byPid[node.ppid] && node.ppid !== node.pid) {
      byPid[node.ppid].children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Filter
  let filtered = tree;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = tree.filter(p => (p.command || '').toLowerCase().includes(q) || p.pid === q);
  }

  // When filtering in Tree mode, rebuild roots from filtered set
  const filteredByPid = {};
  filtered.forEach(p => { filteredByPid[p.pid] = { ...p, children: [] }; });
  const filteredRoots = [];
  filtered.forEach(p => {
    const node = filteredByPid[p.pid];
    if (node && node.ppid && filteredByPid[node.ppid] && node.ppid !== node.pid) {
      filteredByPid[node.ppid].children.push(node);
    } else {
      filteredRoots.push(node);
    }
  });
  const displayRoots = search.trim() ? filteredRoots : roots;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Process Tree ({tree.length} processes)</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`filter-tab ${!flatMode ? 'active' : ''}`} onClick={() => setFlatMode(false)} style={{ fontSize: 12, cursor: 'pointer' }}>Tree</span>
          <span className={`filter-tab ${flatMode ? 'active' : ''}`} onClick={() => setFlatMode(true)} style={{ fontSize: 12, cursor: 'pointer' }}>Flat</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search PID or command..."
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', width: 200, fontSize: 12, outline: 'none' }}
          />
        </div>
      </div>
      <div className="table-container" style={{ maxHeight: 500, overflow: 'auto' }}>
        {flatMode ? (
          <table>
            <thead><tr style={{ position: 'sticky', top: 0, background: 'var(--card-bg)' }}>
              <th>PID</th><th>PPID</th><th>CPU%</th><th>Command</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, 200).map(p => (
                <tr key={p.pid}>
                  <td><code>{p.pid}</code></td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.ppid}</td>
                  <td style={{ color: cpuColor(p.cpu) }}>{p.cpu}%</td>
                  <td><CmdLabel cmd={p.command} pid={p.pid} /></td>
                  <td>
                    <button className="btn btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                      disabled={killMut.isPending}
                      onClick={() => { if (confirm(`Kill PID ${p.pid}?`)) killMut.mutate(p.pid); }}>
                      Kill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          displayRoots.map(root => (
            <ProcessRow key={root.pid} p={root} onKill={(pid) => killMut.mutate(pid)} killing={killMut.isPending} />
          ))
        )}
      </div>
    </div>
  );
}
