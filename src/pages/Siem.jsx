import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { SERVER_BASE_URL } from '../config';

function severityBadgeClass(severity) {
  if (severity === 'critical') return 'badge-red';
  if (severity === 'high') return 'badge-amber';
  if (severity === 'medium') return 'badge-accent';
  return 'badge-gray';
}

function formatDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

export default function Siem() {
  const r = useApi(() => fetch('/api/siem/summary').then(r => r.json()), []);
  const [logsR, setLogs] = useState(null);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [limit, setLimit] = useState(100);
  const toast = useToast();

  const fetchLogs = async () => {
    let url = `/api/siem/logs?limit=${limit}`;
    if (search.trim()) url += `&q=${encodeURIComponent(search)}`;
    if (filterSource) url += `&source=${filterSource}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data);
    } catch (e) {
      toast(`Failed to fetch logs: ${e.message}`, 'error');
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const d = r.data ?? {};
  const logData = logsR || { logs: [], total: 0 };
  const entries = logData.logs || [];
  const totalLogs = logData.total || d.total_logs || 0;
  const sources = d.by_source || {};
  const severities = d.by_severity || {};

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={totalLogs} label="Total Logs" color="accent" />
        <KpiCard value={sources.syslog || 0} label="Syslog" color="green" sub={d.syslog_active ? `port ${d.syslog_port}` : 'inactive'} />
        <KpiCard value={sources.json || 0} label="HTTP JSON" color="accent" />
        <KpiCard value={severities.high || 0} label="High" color="amber" />
        <KpiCard value={severities.critical || 0} label="Critical" color="red" />
        <KpiCard value={Object.keys(sources).length || 0} label="Sources" color="green" sub="active" />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Log Ingestion</div>
          <div className="flex gap-8 items-center">
            <select className="select-sm" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
              <option value="">All Sources</option>
              {Object.keys(sources).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input-sm" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchLogs()}
              placeholder="Search logs..."
              style={{ width: 200 }} />
            <button className="btn btn-sm btn-primary" onClick={fetchLogs}>&#8635; Query</button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="empty-state">
            <p style={{ marginBottom: 12 }}>No log events yet. Send logs via HTTP POST:</p>
            <pre className="code-block" style={{ margin: 0, textAlign: 'left' }}>
              {`# Single event\ncurl -X POST ${SERVER_BASE_URL}/api/siem/ingest \\\n  -H "Content-Type: application/json" \\\n  -d '{"source": "firewall", "message": "Blocked connection", "severity": "high"}'\n\n# Batch\ncurl -X POST ${SERVER_BASE_URL}/api/siem/ingest \\\n  -H "Content-Type: application/json" \\\n  -d '[{"source":"winlog","message":"Event 4625","severity":"medium"},{"source":"winlog","message":"Event 4624","severity":"info"}]'`}
            </pre>
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: 500, overflow: 'auto' }}>
            <table>
              <thead><tr className="th-sticky">
                <th>Time</th><th>Source</th><th>Severity</th><th>Message</th><th>IP / User</th>
              </tr></thead>
              <tbody>
                {entries.map((log, i) => (
                  <tr key={log.timestamp + log.source}>
                    <td className="text-sm text-nowrap">{formatDate(log.timestamp)}</td>
                    <td><span className="badge badge-accent">{log.source || '-'}</span></td>
                    <td>
                      <span className={`badge ${severityBadgeClass(log.severity)}`}>{log.severity}</span>
                    </td>
                    <td className="text-base truncate-sm">
                      {(log.message || '').substring(0, 120)}
                    </td>
                    <td className="text-sm">
                      {log.ip_src || log.ip_dst || log.user || '-'}
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
