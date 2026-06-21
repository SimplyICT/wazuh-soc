import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { apiGet, apiPost } from '../api/wazuhApi';
import SeverityBadge from '../components/SeverityBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function caseStatusBadge(s) {
  const m = { open: 'badge-gray', triaged: 'badge-accent', awaiting_approval: 'badge-amber', approved: 'badge-green', resolved: 'badge-green', closed: 'badge-gray', rejected: 'badge-red', partial: 'badge-amber' };
  return `<span class="badge ${m[s] || 'badge-gray'}">${s}</span>`;
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString();
}

export default function AutopilotCase() {
  const { id } = useParams();
  const r = useApi(() => apiGet(`/autopilot/cases/${id}`), [id]);
  const toast = useToast();
  const navigate = useNavigate();

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const c = r.data;
  const isPending = c.status === 'awaiting_approval';
  const isApproved = c.status === 'approved';

  const handleApprove = () => {
    apiPost(`/autopilot/cases/${id}/approve`)
      .then(() => { toast(`Case #${id} approved`, 'success'); r.refetch(); })
      .catch(e => toast(`Failed: ${e.message}`, 'error'));
  };

  const handleReject = () => {
    apiPost(`/autopilot/cases/${id}/reject`)
      .then(() => { toast(`Case #${id} rejected`, 'info'); r.refetch(); })
      .catch(e => toast(`Failed: ${e.message}`, 'error'));
  };

  const handleExecute = () => {
    if (!confirm(`Execute response plan for Case #${id}?`)) return;
    apiPost(`/autopilot/cases/${id}/execute`)
      .then(() => { toast(`Case #${id} execution triggered`, 'success'); r.refetch(); })
      .catch(e => toast(`Failed: ${e.message}`, 'error'));
  };

  return (
    <>
      <div className="detail-header">
        <div className="detail-info">
          <div className="detail-name">Case #{c.id}</div>
          <div className="detail-meta">
            <SeverityBadge severity={c.severity} />
            <span dangerouslySetInnerHTML={{ __html: caseStatusBadge(c.status) }} />
            <span>{c.alert_count || 0} alerts</span>
            <span>Created: {formatDate(c.created_at)}</span>
            {c.confidence && <span>Confidence: {Math.round(c.confidence * 100)}%</span>}
            {c.mitre?.technique_id && <span className="badge badge-accent">{c.mitre.technique_id} {c.mitre.technique || ''}</span>}
          </div>
        </div>
        <div className="detail-actions">
          {isPending && <><button className="btn btn-primary" onClick={handleApprove}>Approve</button><button className="btn btn-danger" onClick={handleReject}>Reject</button></>}
          {isApproved && <button className="btn btn-primary" onClick={handleExecute}>Execute Plan</button>}
          <button className="btn" onClick={() => navigate('/autopilot')}>Back</button>
        </div>
      </div>

      <div className="cols-2">
        <div className="card">
          <div className="card-header"><div className="card-title">Description</div></div>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 13 }}>{c.description || 'No description'}</p>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Entities ({(c.entities || []).length})</div></div>
          {c.entities?.length ? (
            <table><tbody>{c.entities.map((e, i) => (
              <tr key={i}><td>{e.type}</td><td>{e.value}</td><td><span className="badge badge-gray">{e.role || ''}</span></td></tr>
            ))}</tbody></table>
          ) : <div className="empty-state">No entities</div>}
        </div>
        {c.response_plan && (
          <div className="card col-span-2">
            <div className="card-header"><div className="card-title">Response Plan</div></div>
            <p style={{ marginBottom: 12 }}><strong>Risk:</strong> <SeverityBadge severity={c.response_plan.risk_level || c.severity} /></p>
            <p style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 13 }}>{c.response_plan.summary || ''}</p>
            <table><thead><tr><th>Action</th><th>Target</th><th>Rationale</th></tr></thead>
              <tbody>{(c.response_plan.actions || []).map((a, i) => (
                <tr key={i}><td><span className="badge badge-accent">{a.type}</span></td><td>{a.target || '-'}</td><td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{(a.rationale || '').substring(0, 100)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {c.actions?.length > 0 && (
          <div className="card col-span-2">
            <div className="card-header"><div className="card-title">Executed Actions</div></div>
            <table><thead><tr><th>Action</th><th>Target</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>{c.actions.map((a, i) => (
                <tr key={i}><td>{a.action}</td><td>{a.target || '-'}</td><td>{a.status === 'failed' ? <span className="badge badge-red">Failed</span> : a.status === 'requested' ? <span className="badge badge-amber">Requested</span> : <span className="badge badge-green">Done</span>}</td><td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{(a.detail || '').substring(0, 80)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="card col-span-2">
          <div className="card-header"><div className="card-title">Timeline ({(c.events || []).length})</div></div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table><tbody>
              {(c.events || []).slice().reverse().map((ev, i) => (
                <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{formatDate(ev.timestamp)}</td>
                  <td><span className={`badge ${ev.type === 'approved' ? 'badge-green' : ev.type === 'rejected' ? 'badge-red' : ev.type === 'triaged' || ev.type === 'investigated' ? 'badge-accent' : 'badge-gray'}`}>{ev.type}</span></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{ev.alert_id || ''}</td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
      </div>
    </>
  );
}
