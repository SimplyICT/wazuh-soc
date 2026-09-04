import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useRefresh } from '../components/RefreshContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

function scoreClass(score) {
  if (score >= 80) return 'text-green';
  if (score >= 50) return 'text-amber';
  return 'text-red';
}

export default function SCA() {
  const { key: rk } = useRefresh();
  const [openPolicy, setOpenPolicy] = useState(null);
  const overview = useApi(() => fetch('/api/sca/overview').then(r => r.json()), [], rk);
  const policies = useApi(() => fetch('/api/sca/policies').then(r => r.json()), [], rk);

  if (overview.loading || policies.loading) return <LoadingSpinner />;
  if (overview.error) return <ErrorState message={overview.error.message} onRetry={overview.refetch} />;

  const ov = overview.data || {};
  const list = policies.data?.policies || [];

  return (
    <div className="flex-col gap-16">
      <div className="kpi-row">
        <div className="kpi-card"><div className="kpi-value text-accent">{ov.total_policies || 0}</div><div className="kpi-label">SCA Policies</div></div>
        <div className="kpi-card"><div className={`kpi-value ${scoreClass(ov.avg_score)}`}>{ov.avg_score ?? '-'}%</div><div className="kpi-label">Compliance Score</div></div>
        <div className="kpi-card">
          <div className="kpi-value">{ov.status === 'compliant' ? 'Compliant' : ov.status === 'needs_work' ? 'Needs Work' : 'Non-Compliant'}</div>
          <div className="kpi-label">Overall Status</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Security Configuration Assessment</div></div>
        <div style={{ padding: 16 }}>
          {list.length === 0 ? (
            <div className="empty-state">No compliance frameworks configured yet.</div>
          ) : (
            list.map(p => (
              <div key={p.id} className="card" style={{ margin: '0 0 16px' }}>
                <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setOpenPolicy(openPolicy === p.id ? null : p.id)}>
                  <div className="card-title">{p.name} <span className={`badge ${p.status === 'compliant' ? 'badge-green' : p.status === 'needs_work' ? 'badge-amber' : 'badge-red'}`}>{p.status === 'compliant' ? 'Compliant' : p.status === 'needs_work' ? 'Needs Work' : 'Non-Compliant'}</span></div>
                  <div className={`kpi-value ${scoreClass(p.score)}`} style={{ fontSize: 18 }}>{Math.round(p.score)}%</div>
                </div>
                <p style={{ padding: '0 16px', color: 'var(--text-secondary)', fontSize: 12 }}>{p.description}</p>
                {openPolicy === p.id && (
                  <div style={{ padding: '4px 16px 16px' }}>
                    {p.checks.length === 0 ? (
                      <div className="empty-state">No checks recorded for this framework yet.</div>
                    ) : (
                      p.checks.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                          <span style={{ color: c.passed ? 'var(--accent)' : '#ff4757', width: 16 }}>{c.passed ? '\u2713' : '\u2717'}</span>
                          <code style={{ color: 'var(--text-secondary)', minWidth: 70 }}>{c.id}</code>
                          <span style={{ flex: 1 }}>{c.title}</span>
                          <span className={`badge ${c.score >= 80 ? 'badge-green' : c.score >= 50 ? 'badge-amber' : 'badge-red'}`}>{Math.round(c.score)}%</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}