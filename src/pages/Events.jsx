import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import KpiCard from '../components/KpiCard';
import SeverityBadge from '../components/SeverityBadge';
import FilterTabs from '../components/FilterTabs';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function Events() {
  const r = useApi(() => Promise.all([apiGet('/events?size=100'), apiGet('/events/stats')]), []);
  const [filter, setFilter] = useState('all');

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const [eventsRes, stats] = r.data;
  const items = eventsRes.affected_items || [];
  const sev = stats.severity || {};

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(e => {
      const lvl = e.level || 0;
      const sv = lvl >= 12 ? 'critical' : lvl >= 7 ? 'high' : lvl >= 4 ? 'medium' : 'low';
      return sv === filter;
    });
  }, [items, filter]);

  const columns = [
    { key: 'timestamp', label: 'Time', render: r => new Date(r.timestamp).toLocaleString() },
    { key: 'severity', label: 'Level', render: r => {
      const lvl = r.level || 0;
      const sv = lvl >= 12 ? 'critical' : lvl >= 7 ? 'high' : lvl >= 4 ? 'medium' : 'low';
      return <SeverityBadge severity={sv} />;
    }},
    { key: 'rule_id', label: 'Rule' },
    { key: 'description', label: 'Description', render: r => (r.description || '').substring(0, 80) },
    { key: 'agent', label: 'Agent', render: r => r.agent ? (r.agent.name || r.agent.id || '-') : '-' },
    { key: 'groups', label: 'Group', render: r => (r.groups || []).slice(0, 2).join(', ') },
  ];

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={sev.Critical || 0} label="Critical (12+)" color="red" />
        <KpiCard value={sev.High || 0} label="High (7-11)" color="amber" />
        <KpiCard value={sev.Medium || 0} label="Medium (4-6)" color="accent" />
        <KpiCard value={sev.Low || 0} label="Low (0-3)" color="secondary" />
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Alerts ({filtered.length})</div>
          <FilterTabs tabs={[
            { key: 'all', label: 'All' },
            { key: 'critical', label: 'Critical' },
            { key: 'high', label: 'High' },
            { key: 'medium', label: 'Medium' },
          ]} onChange={setFilter} />
        </div>
        <DataTable columns={columns} data={filtered} />
      </div>
    </>
  );
}
