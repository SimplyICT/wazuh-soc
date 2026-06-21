import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import KpiCard from '../components/KpiCard';
import SeverityBadge from '../components/SeverityBadge';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';

export default function Vulnerabilities() {
  const r = useApi(() => apiGet('/overview/vulnerabilities'), []);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const items = r.data.affected_items || [];
  if (!items.length) return <div className="card"><EmptyState message="Vulnerability Detector not enabled on this Wazuh server." /></div>;

  const sum = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  items.forEach(v => {
    const s = (v.severity || '').toLowerCase();
    const key = s.charAt(0).toUpperCase() + s.slice(1);
    if (sum[key] !== undefined) sum[key]++;
  });

  const columns = [
    { key: 'cve', label: 'CVE', render: r => r.cve || '-' },
    { key: 'agent_id', label: 'Agent' },
    { key: 'package', label: 'Package', render: r => r.package?.name || '-' },
    { key: 'severity', label: 'Severity', render: r => <SeverityBadge severity={r.severity} /> },
    { key: 'cvss_score', label: 'CVSS' },
    { key: 'status', label: 'Status' },
    { key: 'title', label: 'Title', render: r => (r.title || '').substring(0, 50) },
  ];

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={sum.Critical} label="Critical" color="red" />
        <KpiCard value={sum.High} label="High" color="amber" />
        <KpiCard value={sum.Medium} label="Medium" color="accent" />
        <KpiCard value={sum.Low} label="Low" color="secondary" />
      </div>
      <div className="card">
        <DataTable columns={columns} data={items} />
      </div>
    </>
  );
}
