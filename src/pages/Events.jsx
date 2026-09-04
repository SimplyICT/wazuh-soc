import { useState, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { useRefresh } from '../components/RefreshContext';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

const SEVERITY_COLORS = {
  critical: { bg: 'rgba(255,71,87,0.15)', color: '#ff4757', badge: 'badge-red' },
  high: { bg: 'rgba(255,149,0,0.15)', color: '#ff9500', badge: 'badge-amber' },
  medium: { bg: 'rgba(0,180,216,0.12)', color: '#00b4d8', badge: 'badge-accent' },
  low: { bg: 'rgba(143,166,181,0.1)', color: '#8fa6b5', badge: 'badge-gray' },
  info: { bg: 'rgba(143,166,181,0.1)', color: '#8fa6b5', badge: 'badge-gray' },
};

const SOURCE_ICONS = {
  signIn: '\uD83D\uDD11', auditLog: '\uD83D\uDCCB', riskDetection: '\u26A0',
  firewall: '\uD83D\uDEE1', windows: '\uD83D\uFDB5', syslog: '\u2699',
};

function fmtTime(d) {
  if (!d) return '-';
  try { const t = new Date(d); return t.toLocaleString(); } catch { return d; }
}
function timeAgo(d) {
  if (!d) return '-';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; return Math.floor(s / 3600) + 'h';
}

export default function Events() {
  const { key: rk } = useRefresh();
  const siem = useApi(() => fetch('/api/siem/summary').then(r => r.json()), [], rk);
  const itdr = useApi(() => fetch('/api/itdr/summary').then(r => r.json()), [], rk);
  const [sev, setSev] = useState('all');
  const [q, setQ] = useState('');
  const [logs, setLogs] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const abortRef = useRef(null);

  const fetchLogs = async () => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoadingLogs(true);
    setFetchError(null);
    try {
      let url = '/api/siem/logs?limit=200';
      if (sev !== 'all') url += `&severity=${sev}`;
      if (q.trim()) url += `&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const d = await res.json();
      setLogs(d);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setFetchError(err.message || 'Failed to fetch logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  if (siem.loading || itdr.loading) return <LoadingSpinner />;
  if (siem.error || itdr.error) return <ErrorState message="Failed to load" />;

  const siemD = siem.data || {};
  const itdrD = itdr.data || {};
  const logData = logs || { logs: [], total: 0 };
  const entries = logData.logs || [];

  const totalEvents = (siemD.total_logs || 0) + (itdrD.total_events || 0);
  const highCrit = (siemD.by_severity?.critical || 0) + (itdrD.critical || 0) +
                   (siemD.by_severity?.high || 0) + (itdrD.high || 0);

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={totalEvents} label="Total Events" color="accent" />
        <KpiCard value={highCrit} label="High + Critical" color="red" />
        <KpiCard value={siemD.total_logs || 0} label="SIEM Logs" color="accent" />
        <KpiCard value={itdrD.total_events || 0} label="Identity Events" color="green" sub="M365" />
        <KpiCard value={Object.keys(siemD.by_source || {}).length} label="SIEM Sources" color="green" />
        <KpiCard value={itdrD.sources_configured ? 'M365 Connected' : 'M365 Off'} label="ITDR Status" color={itdrD.sources_configured ? 'green' : 'red'} />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Event Log{logs ? ` (${logData.total})` : ''}</div>
          <div className="flex gap-8 items-center flex-wrap">
            <select value={sev} onChange={e => setSev(e.target.value)}
              className="select-sm">
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
            <input value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchLogs()}
              placeholder="Search events..."
              className="input-sm" style={{ width: 200 }} />
            <button className="btn btn-sm btn-primary" onClick={fetchLogs} disabled={loadingLogs}>
              {loadingLogs ? '...' : '\u2315 Query'}
            </button>
          </div>
        </div>
        {fetchError && (
          <div className="error-banner" style={{ padding: '10px 16px', background: 'rgba(255,71,87,0.1)', borderBottom: '1px solid var(--border)', color: '#ff4757', fontSize: 13 }}>
            {fetchError}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="empty-state">
            {logs === null
              ? 'Click "Query" to load events from SIEM and ITDR sources.'
              : 'No events match your filters.'}
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: 600, overflow: 'auto' }}>
            <table>
              <thead><tr className="th-sticky">
                <th>Time</th><th>Source</th><th>Severity</th><th>Message</th><th>Details</th>
              </tr></thead>
              <tbody>
                {entries.map((ev, i) => {
                  const sc = SEVERITY_COLORS[ev.severity] || SEVERITY_COLORS.info;
                  const icon = SOURCE_ICONS[ev.source] || '\u25CF';
                  return (
                    <tr key={ev.id || `${ev.timestamp}-${ev.source}-${i}`} style={{ background: ev.severity === 'critical' ? 'rgba(255,71,87,0.03)' : 'none' }}>
                      <td className="text-sm text-nowrap" title={fmtTime(ev.timestamp)}>{timeAgo(ev.timestamp)}</td>
                      <td><span className="badge badge-gray badge-xs">{icon} {ev.source || '-'}</span></td>
                      <td><span className={`badge ${sc.badge} badge-xs`}>{ev.severity}</span></td>
                      <td className="text-base truncate-sm">
                        {(ev.message || ev.activity || ev.risk_type || ev.ip_address || '-').substring(0, 150)}
                      </td>
                      <td className="text-sm text-secondary">
                        {ev.ip_src || ev.ip_dst || ev.user || ev.source_name || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
