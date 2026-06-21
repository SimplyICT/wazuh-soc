import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { apiGet } from '../api/wazuhApi';
import StatusBadge from '../components/StatusBadge';
import FilterTabs from '../components/FilterTabs';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { FixedSizeList as List } from 'react-window';

function timeAgo(d) {
  if (!d || d === '9999-12-31T23:59:59+00:00') return 'Just now';
  const sec = (Date.now() - new Date(d).getTime()) / 1000;
  if (sec < 60) return 'Just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'offline', label: 'Offline' },
];

const COLUMNS = ['ID', 'Name', 'IP', 'OS', 'Status', 'Version', 'Last Seen'];

export default function Agents() {
  const r = useApi(() => apiGet('/agents?limit=500'), []);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const items = useMemo(() => {
    const raw = r.data ? (r.data.affected_items || r.data) : [];
    return filter === 'all' ? raw : raw.filter(a => a.status === filter);
  }, [r.data, filter]);

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const Row = ({ index, style }) => {
    const a = items[index];
    if (!a) return null;
    const os = a.os ? (a.os.name || '') + ' ' + (a.os.version || '') : 'Unknown';
    return (
      <tr style={style} className="clickable" onClick={() => navigate(`/agent/${a.id}`)}>
        <td>{a.id}</td>
        <td>{a.name}</td>
        <td>{a.ip}</td>
        <td>{os.substring(0, 30)}</td>
        <td><StatusBadge status={a.status} /></td>
        <td>{a.version || '-'}</td>
        <td>{timeAgo(a.lastKeepAlive)}</td>
      </tr>
    );
  };

  return (
    <>
      <FilterTabs tabs={FILTER_TABS} onChange={setFilter} />
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>{COLUMNS.map(c => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody style={{ height: Math.min(items.length * 42, 600), display: 'block', overflowY: 'auto' }}>
              <List height={Math.min(items.length * 42, 600)} itemCount={items.length} itemSize={42} width="100%">
                {Row}
              </List>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
