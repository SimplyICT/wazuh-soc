import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const chartOpts = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { color: '#8fa6b5' } } },
};

const barOpts = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { ticks: { color: '#8fa6b5' } }, y: { ticks: { color: '#8fa6b5' }, beginAtZero: true } },
};

export default function Topology() {
  const r = useApi(() => Promise.all([apiGet('/overview'), apiGet('/topology')]), []);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const [ov, topo] = r.data;
  const byOs = topo.os || {};
  const byVer = topo.version || {};
  const osLabels = Object.keys(byOs).length ? Object.keys(byOs) : Object.keys(ov.os_distribution || {});
  const osValues = Object.keys(byOs).length ? Object.values(byOs) : Object.values(ov.os_distribution || {});

  const osData = osLabels.length ? {
    labels: osLabels,
    datasets: [{ data: osValues, backgroundColor: ['#00b4d8', '#00ff88', '#ff9500', '#ff4757', '#8fa6b5', '#7c3aed'], borderWidth: 0 }],
  } : null;

  const verLabels = Object.keys(byVer);
  const verData = verLabels.length ? {
    labels: verLabels,
    datasets: [{ label: 'Agents', data: verLabels.map(l => byVer[l]), backgroundColor: '#00b4d8' }],
  } : null;

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={ov.total_agents} label="Total Agents" color="accent" />
        <KpiCard value={ov.active} label="Active" color="green" />
        <KpiCard value={ov.offline} label="Offline" color="red" />
      </div>
      <div className="cols-2">
        <div className="card">
          <div className="card-header"><div className="card-title">OS Distribution</div></div>
          <div className="chart-container">
            {osData ? <Doughnut data={osData} options={chartOpts} /> : <div className="empty-state">No OS data</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Agent Versions</div></div>
          <div className="chart-container">
            {verData ? <Bar data={verData} options={barOpts} /> : <div className="empty-state">No version data</div>}
          </div>
        </div>
      </div>
    </>
  );
}
