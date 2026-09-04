import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

const TACTIC_LABELS = {
  reconnaissance: 'Reconnaissance',
  resource_development: 'Resource Development',
  initial_access: 'Initial Access',
  execution: 'Execution',
  persistence: 'Persistence',
  privilege_escalation: 'Privilege Escalation',
  defense_evasion: 'Defense Evasion',
  credential_access: 'Credential Access',
  discovery: 'Discovery',
  lateral_movement: 'Lateral Movement',
  collection: 'Collection',
  command_and_control: 'C&C',
  exfiltration: 'Exfiltration',
  impact: 'Impact',
};

export default function Mitre() {
  const r = useApi(() => fetch('/api/mitre/matrix').then(res => { if (!res.ok) throw new Error(`MITRE matrix fetch failed: ${res.status}`); return res.json(); }), []);
  const techR = useApi(() => fetch('/api/mitre/techniques').then(res => { if (!res.ok) throw new Error(`MITRE techniques fetch failed: ${res.status}`); return res.json(); }), []);
  const [selected, setSelected] = useState(null);

  if (r.loading || techR.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;
  if (techR.error) return <ErrorState message={techR.error.message} onRetry={techR.refetch} />;

  const matrix = r.data?.matrix || {};
  const techniques = techR.data?.techniques || [];
  const maxCount = Math.max(...techniques.map(t => t.count || 0), 1);

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={r.data?.tactics_count || 0} label="Tactics Active" color="accent" />
        <KpiCard value={r.data?.techniques_count || 0} label="Techniques Detected" color="amber" />
        <KpiCard value={r.data?.total_detections_mapped || 0} label="Detections Mapped" color="red" />
        <KpiCard value={techniques.length} label="Total Techniques" color="green" sub="in our detection rules" />
      </div>

      {/* MITRE Matrix Grid */}
      <div className="card">
        <div className="card-header"><div className="card-title">MITRE ATT&CK Matrix — Detected Techniques</div></div>
        <div style={{ overflow: 'auto' }}>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                {['Reconnaissance', 'Resource Dev', 'Initial Access', 'Execution',
                  'Persistence', 'Priv Esc', 'Defense Evasion', 'Cred Access',
                  'Discovery', 'Lateral Move', 'Collection', 'C&C',
                  'Exfil', 'Impact'].map(t => <th key={t} style={{ fontSize: 10, textAlign: 'center', minWidth: 80 }}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                {TACTIC_LABELS && Object.keys(TACTIC_LABELS).map(tactic => {
                  const data = matrix[tactic];
                  const techs = data?.techniques || [];
                  return (
                    <td key={tactic} style={{ verticalAlign: 'top', padding: 4 }}>
                      {techs.length === 0 ? (
                        <div style={{ padding: 8, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10, opacity: 0.3 }}>—</div>
                      ) : (
                        techs.map(tech => {
                          const intensity = tech.count / maxCount;
                          return (
                            <div key={tech.id}
                              style={{
                                background: `rgba(255, 71, 87, ${Math.min(0.1 + intensity * 0.7, 0.8)})`,
                                border: '1px solid rgba(255, 71, 87, 0.3)',
                                borderRadius: 4, padding: '4px 6px', marginBottom: 2,
                                cursor: 'pointer', fontSize: 10,
                              }}
                              onClick={() => setSelected(selected?.id === tech.id ? null : tech)}
                              title={`${tech.name}: ${tech.count} detections`}>
                              <div style={{ fontWeight: 600, fontSize: 10 }}>{tech.id}</div>
                              <div style={{ fontSize: 9, opacity: 0.8 }}>{tech.count} det.</div>
                            </div>
                          );
                        })
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Technique Detail */}
      {selected && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">{selected.id}: {selected.name}</div>
            <button className="btn btn-sm" onClick={() => setSelected(null)}>Close</button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <p><strong>Tactic:</strong> {selected.tactic}</p>
            <p><strong>Detections:</strong> {selected.count}</p>
            <p><strong>Description:</strong> {selected.description}</p>
          </div>
        </div>
      )}

      {/* Technique List */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><div className="card-title">All Detected Techniques ({techniques.length})</div></div>
        <table>
          <thead><tr><th>Technique</th><th>Name</th><th>Tactic</th><th>Detections</th></tr></thead>
          <tbody>
            {techniques.map(t => (
              <tr key={t.id}>
                <td><code>{t.id}</code></td>
                <td style={{ fontSize: 13 }}>{t.name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{t.tactic?.replace(/_/g, ' ')}</td>
                <td><span className="badge badge-red" style={{ fontSize: 10 }}>{t.count}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const SAFE_COLORS = new Set(['accent', 'amber', 'red', 'green', 'blue', 'purple', 'orange', 'teal', 'pink']);

function KpiCard({ value, label, sub, color }) {
  const safeColor = SAFE_COLORS.has(color) ? `var(--${color})` : 'var(--accent)';
  return (
    <div className="kpi-card" style={{ borderTop: `2px solid ${safeColor}` }}>
      <div className="kpi-value" style={{ color: safeColor, fontSize: 24 }}>{value ?? '-'}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
