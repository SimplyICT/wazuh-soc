import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import KpiCard from '../components/KpiCard';
import SeverityBadge from '../components/SeverityBadge';
import FilterTabs from '../components/FilterTabs';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useRefresh } from '../components/RefreshContext';

export default function Events() {
  const { key: refreshKey } = useRefresh();
  const r = useApi(() => Promise.all([apiGet('/events?size=500'), apiGet('/events/stats')]), [], refreshKey);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const items = r.data ? (r.data[0]?.affected_items || []) : [];
  const filtered = useMemo(() => {
    if (!r.data) return [];
    let result = items;
    if (filter !== 'all') {
      result = result.filter(e => {
        const lvl = e.level || 0;
        const sv = lvl >= 12 ? 'critical' : lvl >= 7 ? 'high' : lvl >= 4 ? 'medium' : 'low';
        return sv === filter;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(e =>
        (e.agent?.name || '').toLowerCase().includes(q) ||
        (e.agent?.id || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.id || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, filter, search, r.data]);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const [eventsRes, stats] = r.data;
  const sev = stats.severity || {};

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search agent, ID, description..."
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', width: 220, fontSize: 13, outline: 'none' }}
            />
            <FilterTabs tabs={[
              { key: 'all', label: 'All' },
              { key: 'critical', label: 'Critical' },
              { key: 'high', label: 'High' },
              { key: 'medium', label: 'Medium' },
            ]} onChange={setFilter} />
          </div>
        </div>
        <DataTable columns={columns} data={filtered} />
      </div>
    </>
  );
}
