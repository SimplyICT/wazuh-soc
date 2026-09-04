import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

export default function Users() {
  const r = useApi(() => Promise.all([
    fetch('/api/platform/users').then(r => r.json()),
    fetch('/api/platform/roles').then(r => r.json()),
  ]), []);
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('soc_viewer');
  const [expandedRole, setExpandedRole] = useState(null);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const users = r.data?.[0]?.users || [];
  const roles = r.data?.[1]?.roles || {};

  const handleAdd = async () => {
    if (!username.trim()) return;
    try {
      const res = await fetch('/api/platform/users', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({username: username.trim(), role}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const d = await res.json();
      if (d.id) { toast(`User added: ${d.username}`, 'success'); setUsername(''); r.refetch(); }
      else { toast('Add user: unexpected response', 'error'); }
    } catch (e) {
      toast(e.message || 'Failed to add user', 'error');
    }
  };
  
  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await fetch(`/api/platform/users/${userId}/role`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({role: newRole}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const d = await res.json();
      if (d.success) { toast('Role updated', 'success'); r.refetch(); }
      else { toast('Role change: unexpected response', 'error'); }
    } catch (e) {
      toast(e.message || 'Failed to update role', 'error');
    }
  };


  return (
    <>
      <div className="card">
        <div className="card-header"><div className="card-title">Users ({users.length})</div></div>
        <div className="flex gap-8" style={{ marginBottom: 16 }}>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="Username..."
            className="input-flex"
          />
          <select value={role} onChange={e => setRole(e.target.value)}
            className="select">
            {Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" disabled={!username.trim()} onClick={handleAdd}>Add User</button>
        </div>
        <table>
          <thead><tr><th>Username</th><th>Role</th><th>Org</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.username}>
                <td>{u.username}</td>
                <td>
                  <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                    className="select-sm">
                    {Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                </td>
                <td className="text-base">{u.org_id}</td>
                <td className="text-base text-secondary">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</td>
                <td><span className={`badge ${u.active ? 'badge-green' : 'badge-gray'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Roles & Permissions</div></div>
        <table>
          <thead><tr><th>Role</th><th>Permissions</th></tr></thead>
          <tbody>
            {Object.entries(roles).map(([k, v]) => (
              <tr key={k}>
                <td style={{ fontWeight: 600 }}>{v.name}</td>
                <td>
                  <span style={{ cursor: 'pointer', fontSize: 12, color: 'var(--accent)' }}
                    onClick={() => setExpandedRole(expandedRole === k ? null : k)}>
                    {v.permissions.length} permissions {expandedRole === k ? '▲' : '▼'}
                  </span>
                  {expandedRole === k && (
                    <div className="flex flex-wrap gap-4" style={{ marginTop: 4 }}>
                      {v.permissions.map(p => <span key={p} className="badge badge-gray badge-xs" style={{ fontSize: 10 }}>{p}</span>)}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
