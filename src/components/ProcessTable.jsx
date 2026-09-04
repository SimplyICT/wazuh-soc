import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useSocMutation } from '../hooks/useMutation';
import LoadingSpinner from './LoadingSpinner';
import ErrorState from './ErrorState';
import { useToast } from '../context/ToastContext';

export default function ProcessTable({ agentId }) {
  const [sortKey, setSortKey] = useState('cpu');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const toast = useToast();

  const r = useApi(
    async () => {
      const res = await fetch(`/api/edr/agent/${agentId}/processes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [agentId],
  );

  const killMut = useSocMutation(
    async (pid) => {
      const res = await fetch(`/api/edr/agent/${agentId}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      });
      return res.json();
    },
    {
      invalidateKeys: ['api/edr/'],
      onSuccess: () => toast('Process killed', 'success'),
      onError: (e) => toast(`Failed: ${e.message}`, 'error'),
    },
  );

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const processes = r.data?.processes || [];
  if (!processes.length) {
    return (
      <div className="card">
        <div className="card-header"><div className="card-title">Running Processes</div></div>
        <div className="empty-state">
          {r.data?.error ? `Error: ${r.data.error}` : 'No process data available. Agent may not be SSH-reachable.'}
        </div>
      </div>
    );
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortArrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  let filtered = [...processes];
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.command.toLowerCase().includes(q) || p.user.toLowerCase().includes(q)
    );
  }

  // Multi-strategy sort with null/undefined/empty fallback:
  // 1. Nullish/empty values sort last (pushed to end regardless of direction)
  // 2. Values that parse as numbers → numeric comparison (avoids "10" < "2")
  // 3. Everything else → locale-aware string comparison
  // Sorts in-place; `sortKey` selects the property, `sortDir` controls asc/desc.
  filtered.sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (va === null || va === undefined || va === '') return 1;
    if (vb === null || vb === undefined || vb === '') return -1;
    const na = Number(va);
    const nb = Number(vb);
    if (!isNaN(na) && !isNaN(nb)) {
      return sortDir === 'asc' ? na - nb : nb - na;
    }
    const sa = String(va);
    const sb = String(vb);
    return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });

  const headerStyle = { cursor: 'pointer', userSelect: 'none', fontSize: 11 };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Running Processes ({processes.length})</div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter processes..."
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', width: 200, fontSize: 12, outline: 'none' }}
        />
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={headerStyle} onClick={() => handleSort('pid')}>PID{sortArrow('pid')}</th>
              <th style={headerStyle} onClick={() => handleSort('user')}>User{sortArrow('user')}</th>
              <th style={headerStyle} onClick={() => handleSort('cpu')}>CPU%{sortArrow('cpu')}</th>
              <th style={headerStyle} onClick={() => handleSort('mem')}>MEM%{sortArrow('mem')}</th>
              <th style={headerStyle} onClick={() => handleSort('command')}>Command{sortArrow('command')}</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((p, i) => (
              <tr key={p.pid}>
                <td><code>{p.pid}</code></td>
                <td style={{ fontSize: 12 }}>{p.user}</td>
                <td>
                  <span style={{ color: parseFloat(p.cpu) > 50 ? 'var(--red)' : parseFloat(p.cpu) > 20 ? 'var(--amber)' : 'inherit' }}>
                    {p.cpu}
                  </span>
                </td>
                <td>{p.mem}</td>
                <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.command}</td>
                <td>
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={killMut.isPending}
                    onClick={() => { if (confirm(`Kill PID ${p.pid} (${(p.command || '').substring(0, 40)})?`)) killMut.mutate(p.pid); }}
                  >
                    Kill
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
