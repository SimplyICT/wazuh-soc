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
const ROW_HEIGHT = 42;

function renderRow(items, navigate) {
  return function Row({ index, style }) {
    const a = items[index];
    if (!a) return null;
    const os = a.os ? (a.os.name || '') + ' ' + (a.os.version || '') : 'Unknown';
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
           className="list-row" onClick={() => navigate(`/agent/${a.id}`)}>
        <div style={{ flex: '0 0 60px', padding: '0 8px' }}>{a.id}</div>
        <div style={{ flex: '1 1 150px', padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
        <div style={{ flex: '0 0 120px', padding: '0 8px' }}>{a.ip}</div>
        <div style={{ flex: '1 1 180px', padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{os.substring(0, 30)}</div>
        <div style={{ flex: '0 0 100px', padding: '0 8px' }}><StatusBadge status={a.status} /></div>
        <div style={{ flex: '0 0 100px', padding: '0 8px' }}>{a.version || '-'}</div>
        <div style={{ flex: '0 0 100px', padding: '0 8px' }}>{timeAgo(a.lastKeepAlive)}</div>
      </div>
    );
  };
}

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

  const listHeight = Math.min(items.length * ROW_HEIGHT, 600);

  return (
    <>
      <FilterTabs tabs={FILTER_TABS} onChange={setFilter} />
      <div className="card">
        <div className="table-container" style={{ padding: 0 }}>
          <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <div style={{ flex: '0 0 60px', padding: '0 8px' }}>ID</div>
            <div style={{ flex: '1 1 150px', padding: '0 8px' }}>Name</div>
            <div style={{ flex: '0 0 120px', padding: '0 8px' }}>IP</div>
            <div style={{ flex: '1 1 180px', padding: '0 8px' }}>OS</div>
            <div style={{ flex: '0 0 100px', padding: '0 8px' }}>Status</div>
            <div style={{ flex: '0 0 100px', padding: '0 8px' }}>Version</div>
            <div style={{ flex: '0 0 100px', padding: '0 8px' }}>Last Seen</div>
          </div>
          <List height={listHeight} itemCount={items.length} itemSize={ROW_HEIGHT} width="100%">
            {renderRow(items, navigate)}
          </List>
        </div>
      </div>
    </>
  );
}
