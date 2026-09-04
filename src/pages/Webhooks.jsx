import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

const EVENT_OPTIONS = [
  'alert.critical', 'alert.high', 'case.created', 'case.resolved',
  'edr.isolated', 'edr.released', 'itdr.detection', 'siem.correlation',
  'agent.offline', 'agent.online',
];

export default function Webhooks() {
  const r = useApi(() => fetch('/api/platform/webhooks').then(r => r.json()), []);
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState([]);

  const toggleEvent = (e) => {
    setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  };

  const handleAdd = async () => {
    if (!url.trim() || events.length === 0) return;
    try {
      const res = await fetch('/api/platform/webhooks', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({url: url.trim(), events}),
      });
      if (!res.ok) { toast(`Failed to register webhook (${res.status})`, 'error'); return; }
      const d = await res.json();
      if (d.id) { toast('Webhook registered', 'success'); setUrl(''); setEvents([]); r.refetch(); }
      else { toast('Unexpected response from server', 'error'); }
    } catch (err) {
      toast(err.message || 'Network error registering webhook', 'error');
    }
  };
  const handleDelete = async (id) => {
    if (!confirm('Delete this webhook?')) return;
    try {
      const res = await fetch(`/api/platform/webhooks/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast(`Failed to delete webhook (${res.status})`, 'error'); return; }
      const d = await res.json();
      if (d.success) { toast('Webhook deleted', 'success'); r.refetch(); }
      else { toast('Unexpected response from server', 'error'); }
    } catch (err) {
      toast(err.message || 'Network error deleting webhook', 'error');
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const webhooks = r.data?.webhooks || [];

  return (
    <div className="card">
      <div className="card-header"><div className="card-title">Webhooks ({webhooks.length})</div></div>

      <div className="card-mb">
        <div className="flex gap-8" style={{ marginBottom: 8 }}>
          <input className="input-flex" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://hooks.example.com/endpoint..."
          />
        </div>
        <div className="flex flex-wrap gap-4" style={{ marginBottom: 8 }}>
          {EVENT_OPTIONS.map(ev => (
            <span key={ev}
              className={`filter-tab text-sm ${events.includes(ev) ? 'active' : ''}`}
              onClick={() => toggleEvent(ev)}
              style={{ cursor: 'pointer' }}>
              {ev}
            </span>
          ))}
        </div>
        <button className="btn btn-sm btn-primary" disabled={!url.trim() || events.length === 0} onClick={handleAdd}>
          Register Webhook
        </button>
      </div>

      {webhooks.length === 0 ? (
        <div className="empty-state">No webhooks registered.</div>
      ) : (
        <table>
          <thead><tr><th>URL</th><th>Events</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {webhooks.map((w, i) => (
              <tr key={w.url}>
                <td className="text-base text-truncate" style={{ maxWidth: 300 }}><code>{w.url}</code></td>
                <td><div className="flex flex-wrap gap-4">
                  {(w.events || []).map((ev, j) => <span key={ev} className="badge badge-gray badge-xs">{ev}</span>)}
                </div></td>
                <td className="text-base text-secondary">{w.created_at ? new Date(w.created_at).toLocaleDateString() : '-'}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(w.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
