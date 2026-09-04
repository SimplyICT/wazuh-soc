import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

const TYPE_COLORS = {
  IPv4: 'badge-accent', domain: 'badge-green', hostname: 'badge-gray',
  URL: 'badge-amber', MD5: 'badge-red', SHA256: 'badge-red',
  SHA1: 'badge-red', email: 'badge-gray', FilePath: 'badge-gray',
  Mutex: 'badge-gray', CVE: 'badge-red',
};

export default function Threats() {
  const r = useApi(() => fetch('/api/threat-intel/summary').then(r => r.json()), []);
  const [iocData, setIocData] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchIocs = async () => {
    setLoading(true);
    try {
      let url = '/api/threat-intel/iocs?limit=500';
      if (typeFilter) url += `&type=${typeFilter}`;
      if (search.trim()) url += `&q=${encodeURIComponent(search)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIocData(data);
    } catch (err) {
      console.error('Failed to fetch IOCs:', err);
    } finally {
      setLoading(false);
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const d = r.data || {};
  const iocs = iocData?.iocs || [];
  const byType = d.by_type || {};

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={d.total_iocs || 0} label="Total IOCs" color="accent" />
        <KpiCard value={Object.keys(byType).length} label="IOC Types" color="green" />
        <KpiCard value={Object.keys(d.by_source || {}).length} label="Sources" color="accent" sub={d.sources_configured?.otx ? 'OTX connected' : 'OTX not configured'} />
        <KpiCard value={d.last_updated ? new Date(d.last_updated).toLocaleDateString() : '-'} label="Last Updated" color="green" />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Indicators of Compromise ({iocData?.iocs?.length || d.total_iocs || 0})</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {Object.keys(byType).slice(0, 6).map(t => (
              <span key={t} className={`filter-tab ${typeFilter === t ? 'active' : ''}`}
                style={{ fontSize: 11, cursor: 'pointer' }}
                onClick={() => setTypeFilter(typeFilter === t ? '' : t)}>
                {t} ({byType[t]})
              </span>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchIocs()}
              placeholder="Search..."
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', width: 150, fontSize: 12, outline: 'none' }} />
            <button className="btn btn-sm btn-primary" onClick={fetchIocs} disabled={loading}>
              {loading ? '...' : 'Query'}
            </button>
            <button className="btn btn-sm" onClick={async () => { try { await fetch('/api/threat-intel/update', { method: 'POST' }); } catch (err) { console.error('Failed to update threat intel:', err); } fetchIocs(); r.refetch(); }}>
              Update
            </button>
          </div>
        </div>

        {iocs.length === 0 && iocData === null ? (
          <div className="empty-state">Click "Query" to load IOCs, or "Update" to fetch from threat intel sources.</div>
        ) : iocs.length === 0 ? (
          <div className="empty-state">No IOCs match your filters.</div>
        ) : (
          <div className="table-container" style={{ maxHeight: 500, overflow: 'auto' }}>
            <table>
              <thead><tr style={{ position: 'sticky', top: 0, background: 'var(--card-bg)' }}>
                <th>Type</th><th>Indicator</th><th>Source</th><th>Description</th><th>Tags</th>
              </tr></thead>
              <tbody>
                {iocs.map((ioc, i) => (
                  <tr key={ioc.indicator}>
                    <td><span className={`badge ${TYPE_COLORS[ioc.type] || 'badge-gray'}`} style={{ fontSize: 10 }}>{ioc.type}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{ioc.indicator}</td>
                    <td style={{ fontSize: 11 }}>{ioc.source}</td>
                    <td style={{ fontSize: 11, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ioc.description}</td>
                    <td>{(ioc.tags || []).slice(0, 3).map((t, j) =>
                      <span key={t} className="badge badge-gray" style={{ fontSize: 9, marginRight: 2 }}>{t}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
