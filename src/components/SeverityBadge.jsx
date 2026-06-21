export default function SeverityBadge({ severity }) {
  const s = (severity || '').toLowerCase();
  const map = { critical: 'severity-critical', high: 'severity-high', medium: 'severity-medium', low: 'severity-low' };
  return <span className={`badge ${map[s] || 'severity-low'}`}>{s}</span>;
}
