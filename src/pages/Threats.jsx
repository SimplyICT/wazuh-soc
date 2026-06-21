import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { apiGet, apiPost } from '../api/wazuhApi';
import KpiCard from '../components/KpiCard';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

export default function Threats() {
  const otx = useApi(() => apiGet('/otx/status'), []);
  const iocs = useApi(() => apiGet('/otx/iocs'), []);
  const toast = useToast();

  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  if (otx.loading || iocs.loading) return <LoadingSpinner />;
  if (otx.error) return <ErrorState message={otx.error.message} onRetry={otx.refetch} />;
  if (iocs.error) return <ErrorState message={iocs.error.message} onRetry={iocs.refetch} />;

  const status = otx.data;
  const items = iocs.data?.iocs || [];
  const enabled = status.enabled;

  const filtered = useMemo(() => {
    let f = items;
    if (typeFilter) f = f.filter(i => i.type === typeFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      f = f.filter(i => i.value.toLowerCase().includes(q));
    }
    return f;
  }, [items, typeFilter, searchQuery]);

  const typeCounts = {};
  items.forEach(i => { typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });

  const typeLabels = Object.keys(typeCounts).sort();

  const handleRefresh = () => {
    apiPost('/otx/refresh')
      .then(d => {
        if (d.status === 'error') toast(`OTX update failed: ${d.message || 'unknown'}`, 'error');
        else toast(`OTX updated: ${d.total_iocs} IOCs`, 'success');
        otx.refetch(); iocs.refetch();
      })
      .catch(e => toast(`OTX refresh failed: ${e.message}`, 'error'));
  };

  const handleDownloadCSV = () => {
    if (!items.length) { toast('No IOCs to download', 'error'); return; }
    apiGet('/otx/iocs').then(d => {
      const lines = ['type,value,category'];
      (d.iocs || []).forEach(i => lines.push(`${i.type},${i.value},${i.category || ''}`));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'otx_iocs.csv';
      a.click();
      toast('Downloaded', 'success');
    }).catch(e => toast(`Download failed: ${e.message}`, 'error'));
  };

  const typeLabel = (t) => {
    const map = { ip: 'IP', domain: 'Domain', md5: 'MD5', sha1: 'SHA1', sha256: 'SHA256', url: 'URL' };
    return map[t] || t;
  };

  const typeColor = (t) => {
    if (t === 'ip') return 'badge-red';
    if (t === 'domain') return 'badge-amber';
    if (t.includes('sha') || t === 'md5') return 'badge-accent';
    return 'badge-gray';
  };

  const columns = [
    { key: 'type', label: 'Type', render: r => <span className={`badge ${typeColor(r.type)}`}>{typeLabel(r.type)}</span> },
    { key: 'value', label: 'Value', render: r => <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.value}</span> },
    { key: 'category', label: 'Category', render: r => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.category || ''}</span> },
  ];

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={enabled ? 'Active' : 'Inactive'} label="OTX Integration" color={enabled ? 'green' : 'red'} />
        <KpiCard value={status.total_iocs || 0} label="Total IOCs" color="accent" />
        <KpiCard value={status.ips || 0} label="Malicious IPs" color="amber" />
        <KpiCard value={status.domains || 0} label="Malicious Domains" color="accent" />
        <KpiCard value={status.hashes || 0} label="File Hashes" color="secondary" />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, marginRight: 4 }}>Filter:</span>
        <button className={`btn ${typeFilter === '' ? 'btn-primary' : ''}`} onClick={() => setTypeFilter('')}>All</button>
        {typeLabels.map(t => (
          <button key={t} className={`btn ${typeFilter === t ? 'btn-primary' : ''}`} onClick={() => setTypeFilter(t)}>
            {t} ({typeCounts[t]})
          </button>
        ))}
        {enabled && <><button className="btn" onClick={handleRefresh}>Refresh</button><button className="btn" onClick={handleDownloadCSV}>Download CSV</button></>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">Integration Details</div></div>
        <table><tbody>
          <tr><td>Status</td><td><span className={`badge ${enabled ? 'badge-green' : 'badge-red'}`}>{enabled ? 'Active' : 'Inactive'}</span></td></tr>
          <tr><td>Rules File</td><td>{status.size_bytes ? `${(status.size_bytes / 1024).toFixed(1)} KB` : '\u2014'}</td></tr>
          <tr><td>Last Updated</td><td>{status.last_updated ? new Date(status.last_updated).toLocaleString() : '\u2014'}</td></tr>
          <tr><td>IOC Count</td><td>{status.total_iocs || 0}</td></tr>
          <tr><td>Pulse Sources</td><td>{status.pulse_count || '\u2014'}</td></tr>
        </tbody></table>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Indicators of Compromise <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12 }}>({filtered.length}/{items.length})</span></div>
          <input
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 4, width: 200, fontSize: 13 }}
            placeholder="Search IOCs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        {filtered.length ? (
          <div className="table-container" style={{ maxHeight: 500, overflowY: 'auto' }}>
            <DataTable columns={columns} data={filtered} />
          </div>
        ) : <div className="empty-state">No IOCs match your filter.</div>}
      </div>
    </>
  );
}
