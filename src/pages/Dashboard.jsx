import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useMemo } from 'react';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const chartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { color: '#8fa6b5' } } },
};

const barOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { ticks: { color: '#8fa6b5' } }, y: { ticks: { color: '#8fa6b5' }, beginAtZero: true } },
};

export default function Dashboard() {
  const r = useApi(() => Promise.all([apiGet('/overview'), apiGet('/events/stats')]), []);
  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const [d, ev] = r.data;
  const sev = ev.severity || {};
  const totalAlerts = (sev.Critical || 0) + (sev.High || 0) + (sev.Medium || 0) + (sev.Low || 0);
  const totalVuln = useMemo(() => {
    let t = 0;
    if (d.vulnerabilities) for (const k in d.vulnerabilities) t += (d.vulnerabilities[k] || 0);
    return t;
  }, [d]);
  const threatScore = sev.Critical ? Math.min(100, Math.round((sev.Critical / Math.max(1, totalAlerts)) * 100)) : 0;

  const statusData = { labels: ['Active', 'Offline', 'Never Connected'], datasets: [{ data: [d.active, d.offline, d.never_connected || 0], backgroundColor: ['#00ff88', '#ff4757', '#8fa6b5'], borderWidth: 0 }] };

  const osLabels = d.os_distribution ? Object.keys(d.os_distribution) : [];
  const osData = d.os_distribution ? { labels: osLabels, datasets: [{ label: 'Agents', data: osLabels.map(l => d.os_distribution[l]), backgroundColor: '#00b4d8' }] } : null;

  const alertData = { labels: ['Critical', 'High', 'Medium', 'Low'], datasets: [{ data: [sev.Critical || 0, sev.High || 0, sev.Medium || 0, sev.Low || 0], backgroundColor: ['#ff4757', '#ff9500', '#00b4d8', '#8fa6b5'], borderWidth: 0 }] };

  const scaColor = d.sca_score >= 80 ? 'green' : d.sca_score >= 50 ? 'amber' : 'red';
  const threatColor = threatScore > 50 ? 'red' : threatScore > 20 ? 'amber' : 'green';

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={d.total_agents} label="Total Agents" color="accent" />
        <KpiCard value={d.active} label="Active" color="green" />
        <KpiCard value={d.offline} label="Offline" color="red" />
        <KpiCard value={totalVuln} label="Vulnerabilities" color="amber" />
        <KpiCard value={`${d.sca_score}%`} label="SCA Score" color={scaColor} />
        <KpiCard value={`${threatScore}%`} label="Threat Index" color={threatColor} sub={`${totalAlerts} alerts / 24h`} />
      </div>

      <div className="cols-3">
        <div className="card">
          <div className="card-header"><div className="card-title">Agent Status</div></div>
          <div className="chart-container"><Doughnut data={statusData} options={chartOptions} /></div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">OS Distribution</div></div>
          <div className="chart-container">
            {osData ? <Bar data={osData} options={barOptions} /> : <div className="empty-state">No OS data</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Alert Severity (24h)</div></div>
          <div className="chart-container"><Doughnut data={alertData} options={chartOptions} /></div>
        </div>
      </div>
    </>
  );
}
