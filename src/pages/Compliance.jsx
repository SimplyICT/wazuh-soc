import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

const STATUS_COLORS = {
  compliant: 'badge-green',
  needs_work: 'badge-amber',
  non_compliant: 'badge-red',
};

function scoreColor(s) {
  if (s >= 80) return 'var(--green)';
  if (s >= 50) return 'var(--amber)';
  return 'var(--red)';
}

export default function Compliance() {
  const r = useApi(() => fetch('/api/compliance/overview').then(r => r.json()), []);
  const toast = useToast();
  const [detail, setDetail] = useState(null);

  const loadDetail = async (fw) => {
    try {
      const res = await fetch(`/api/compliance/${fw}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setDetail(d);
    } catch (e) {
      toast(`Failed to load details: ${e.message}`, 'error');
      setDetail(null);
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const frameworks = Object.entries(r.data || {});

  return (
    <>
      <div className="kpi-row">
        {frameworks.map(([key, fw]) => (
          <div key={key} className="kpi-card" onClick={() => loadDetail(key)}
            style={{ cursor: 'pointer', borderLeft: `3px solid ${scoreColor(fw.overall_score)}` }}>
            <div className="kpi-value" style={{ fontSize: 14, color: scoreColor(fw.overall_score) }}>
              {fw.overall_score}%
            </div>
            <div className="kpi-label">{fw.name}</div>
            <div className="text-sm" style={{ marginTop: 4 }}>
              <span className={`badge ${STATUS_COLORS[fw.status] || 'badge-gray'}`}>{fw.status}</span>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">{detail.name} — {detail.overall_score}%</div>
            <button className="btn btn-sm" onClick={() => { setFramework(null); setDetail(null); }}>Close</button>
          </div>
          <p className="text-md text-secondary" style={{ marginBottom: 12 }}>{detail.description}</p>
          <table>
            <thead><tr><th>Control</th><th>Description</th><th>Score</th><th>Status</th></tr></thead>
            <tbody>
              {(detail.requirements || []).map((req, i) => (
                <tr key={req.id}>
                  <td><code>{req.id}</code></td>
                  <td className="text-md">{req.description}</td>
                  <td style={{ color: scoreColor(req.score), fontWeight: 600 }}>{req.score}%</td>
                  <td>
                    <span className={`badge ${
                      req.score >= 80 ? 'badge-green' :
                      req.score >= 50 ? 'badge-amber' :
                      'badge-red'
                    }`}>
                      {req.score >= 80 ? 'Compliant' : req.score >= 50 ? 'Needs Work' : 'Non-Compliant'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
