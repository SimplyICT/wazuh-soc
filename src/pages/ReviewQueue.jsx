import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function timeAgo(d) {
  if (!d) return '-';
  const sec = (Date.now() - new Date(d).getTime()) / 1000;
  if (sec < 60) return 'Just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

function slaStatus(item) {
  if (item.sla_breached) return { label: 'BREACHED', cls: 'badge-red' };
  if ((item.sla_pct || 0) > 80) return { label: 'At Risk', cls: 'badge-amber' };
  return { label: 'On Track', cls: 'badge-green' };
}

function sevColor(s) {
  return s === 'critical' ? 'var(--red)' : s === 'high' ? 'var(--amber)' : s === 'medium' ? 'var(--accent)' : 'var(--text-secondary)';
}

function safeStringify(value, maxLen) {
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return str.substring(0, maxLen);
  } catch {
    return 'Unable to display details';
  }
}

export default function ReviewQueue() {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [noteText, setNoteText] = useState('');
  const toast = useToast();

  const r = useApi(() => Promise.all([
    fetch('/api/socqueue').then(r => r.json()),
    fetch('/api/socqueue/summary').then(r => r.json()),
  ]), []);

  const refresh = () => r.refetch();

  const handleClaim = async (itemId, analyst) => {
    try {
      const res = await fetch(`/api/socqueue/${itemId}/claim`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({item_id: itemId, analyst}),
      });
      if (!res.ok) throw new Error(`Claim failed: ${res.status}`);
      toast('Claimed', 'success');
      refresh();
      if (selected === itemId) setSelected(null);
    } catch (err) {
      toast(err.message || 'Failed to claim', 'error');
    }
  };

  const handleResolve = async (itemId) => {
    try {
      const res = await fetch(`/api/socqueue/${itemId}/resolve`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({item_id: itemId}),
      });
      if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
      toast('Resolved', 'success');
      refresh();
    } catch (err) {
      toast(err.message || 'Failed to resolve', 'error');
    }
  };

  const handleEscalate = async (itemId) => {
    try {
      const res = await fetch(`/api/socqueue/${itemId}/escalate`, { method: 'POST' });
      if (!res.ok) throw new Error(`Escalate failed: ${res.status}`);
      toast('Escalated', 'info');
      refresh();
    } catch (err) {
      toast(err.message || 'Failed to escalate', 'error');
    }
  };

  const handleAddNote = async (itemId) => {
    if (!noteText.trim()) return;
    try {
      const res = await fetch(`/api/socqueue/${itemId}/notes`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({author: 'analyst', text: noteText.trim()}),
      });
      if (!res.ok) throw new Error(`Add note failed: ${res.status}`);
      setNoteText('');
      toast('Note added', 'success');
    } catch (err) {
      toast(err.message || 'Failed to add note', 'error');
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const items = r.data?.[0]?.items || [];
  const summary = r.data?.[1] || {};

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={items.length} label="Queue" color="accent" />
        <KpiCard value={summary.unassigned || 0} label="Unassigned" color="red" sub="needs review" />
        <KpiCard value={summary.sla_breached || 0} label="SLA Breached" color="red" />
        <KpiCard value={summary.by_status?.investigating || 0} label="Investigating" color="amber" />
        <KpiCard value={summary.by_severity?.critical || 0} label="Critical" color="red" />
        <KpiCard value={summary.notes_count || 0} label="Notes" color="green" />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Alert Queue ({items.length})</div>
          <button className="btn btn-sm" onClick={refresh}>&#8635; Refresh</button>
        </div>
        <div className="filter-tabs">
          {['all', 'new', 'investigating', 'contained', 'resolved', 'escalated', 'closed'].map(s => (
            <span key={s}
              className={`filter-tab ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && ` (${summary.by_status?.[s] || 0})`}
            </span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">No items in queue. Alerts from EDR/ITDR/SIEM appear here when they need human review.</div>
        ) : (
          <div className="flex-col gap-8">
            {filtered.map(item => (
              <div key={item.id}
                className="card"
                style={{
                  padding: 12, margin: 0, cursor: 'pointer',
                  borderLeft: `3px solid ${sevColor(item.severity)}`,
                  background: item.sla_breached ? 'rgba(255,71,87,0.05)' : 'var(--card-bg)',
                }}
                onClick={() => setSelected(selected === item.id ? null : item.id)}>
                <div className="flex justify-between items-center gap-8">
                  <div className="flex-1">
                    <div className="flex gap-6 items-center" style={{ marginBottom: 2 }}>
                      <span className="badge badge-red severity-badge" style={{ background: sevColor(item.severity) }}>{item.severity}</span>
                      <span className={`badge badge-xs ${
                        item.status === 'new' ? 'badge-amber' :
                        item.status === 'investigating' ? 'badge-accent' :
                        item.status === 'resolved' ? 'badge-green' :
                        item.status === 'escalated' ? 'badge-red' :
                        'badge-gray'
                      }`}>{item.status}</span>
                      <span className={`${slaStatus(item).cls} text-xs`}>{slaStatus(item).label}</span>
                      <span className="text-xs text-secondary">{item.source}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                    <div className="text-sm text-secondary" style={{ marginTop: 2 }}>
                      {item.id} — {timeAgo(item.created_at)}
                      {item.assigned_to && ` — Assigned: ${item.assigned_to}`}
                    </div>
                  </div>
                  <div className="flex gap-4 flex-shrink-0">
                    {item.status === 'new' && (
                      <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); handleClaim(item.id, 'analyst'); }}>
                        Claim
                      </button>
                    )}
                    {item.status === 'investigating' && (
                      <button className="btn btn-sm btn-green" onClick={(e) => { e.stopPropagation(); handleResolve(item.id); }}>
                        Resolve
                      </button>
                    )}
                    {item.status !== 'escalated' && item.status !== 'resolved' && (
                      <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleEscalate(item.id); }}>
                        Escalate
                      </button>
                    )}
                  </div>
                </div>

                {selected === item.id && (
                  <div className="detail-section">
                    <div className="text-base" style={{ marginBottom: 8 }}>
                      <strong>Details:</strong> {item.details ? safeStringify(item.details, 200) : 'None'}
                    </div>
                    <div className="text-base" style={{ marginBottom: 8 }}>
                      <strong>SLA:</strong> Respond by {item.respond_by ? new Date(item.respond_by).toLocaleString() : '-'} | Resolve by {item.resolve_by ? new Date(item.resolve_by).toLocaleString() : '-'}
                    </div>
                    <div className="flex gap-6" style={{ marginBottom: 8 }}>
                      <input value={noteText} onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note..."
                        className="input-sm"
                      />
                      <button className="btn btn-sm" disabled={!noteText.trim()} onClick={() => handleAddNote(item.id)}>Add Note</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
