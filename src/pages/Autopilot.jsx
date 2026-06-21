import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import KpiCard from '../components/KpiCard';
import SeverityBadge from '../components/SeverityBadge';
import CaseStatusBadge from '../components/CaseStatusBadge';
import FilterTabs from '../components/FilterTabs';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

function timeAgo(d) {
  if (!d) return '-';
  const sec = (Date.now() - new Date(d).getTime()) / 1000;
  if (sec < 60) return 'Just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

export default function Autopilot() {
  const r = useApi(() => Promise.all([apiGet('/autopilot/cases'), apiGet('/autopilot/stats')]), []);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const [casesRes, stats] = r.data;
  const cases = casesRes.affected_items || [];
  const pending = cases.filter(c => c.status === 'awaiting_approval').length;

  const filtered = useMemo(() => {
    if (filter === 'all') return cases;
    return cases.filter(c => c.status === filter);
  }, [cases, filter]);

  const columns = [
    { key: 'id', label: 'ID', render: r => `#${r.id}` },
    { key: 'title', label: 'Title', render: r => (r.title || '').substring(0, 50) },
    { key: 'severity', label: 'Severity', render: r => <SeverityBadge severity={r.severity} /> },
    { key: 'status', label: 'Status', render: r => <CaseStatusBadge status={r.status} /> },
    { key: 'alert_count', label: 'Alerts' },
    { key: 'mitre', label: 'MITRE', render: r => r.mitre?.technique_id ? <span className="badge badge-accent">{r.mitre.technique_id}</span> : '-' },
    { key: 'updated_at', label: 'Updated', render: r => timeAgo(r.updated_at) },
  ];

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={stats.last_24h || 0} label="Last 24h" color="accent" />
        <KpiCard value={stats.critical || 0} label="Critical" color="red" />
        <KpiCard value={stats.high || 0} label="High" color="amber" />
        <KpiCard value={pending} label="Awaiting" color="amber" />
        <KpiCard value={stats.resolved || 0} label="Resolved" color="green" />
        <KpiCard value={stats.avg_triage_time ? `${Math.round(stats.avg_triage_time)}s` : '-'} label="Avg Triage" color="secondary" />
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Active Cases ({cases.length})</div>
          <FilterTabs tabs={[
            { key: 'all', label: 'All' },
            { key: 'awaiting_approval', label: 'Pending' },
            { key: 'open', label: 'Open' },
            { key: 'resolved', label: 'Resolved' },
          ]} onChange={setFilter} />
        </div>
        <DataTable columns={columns} data={filtered} onRowClick={row => navigate(`/autopilot/case/${row.id}`)} />
      </div>
    </>
  );
}
