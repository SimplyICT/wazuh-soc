export default function KpiCard({ value, label, sub, color = 'accent' }) {
  const colorMap = {
    green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)',
    accent: 'var(--accent)', secondary: 'var(--text-secondary)',
  };
  return (
    <div className="kpi-card">
      <div className="kpi-value" style={{ color: colorMap[color] || colorMap.accent }}>{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
