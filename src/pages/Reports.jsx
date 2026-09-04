import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function formatDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

export default function Reports() {
  const r = useApi(() => fetch('/api/reports').then(r => r.json()), []);
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [viewReport, setViewReport] = useState(null);
  const [reportHtml, setReportHtml] = useState(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/reports/generate', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || 'Failed to generate report');
      }
      await res.json();
      toast('Report generated', 'success');
      r.refetch();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleView = async (id) => {
    setViewReport(id);
    try {
      const res = await fetch(`/api/reports/${id}/html`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || 'Failed to load report');
      }
      const html = await res.text();
      setReportHtml(html);
    } catch (e) {
      toast(e.message, 'error');
      setViewReport(null);
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const reports = r.data?.reports || [];

  return (
    <>
      <div className="kpi-row">
        <KpiCard value={reports.length} label="Reports Generated" color="accent" />
        <KpiCard value={reports.length > 0 ? reports[0]?.period || '-' : '-'} label="Latest Period" color="green" />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">SOC Reports</div>
          <button className="btn btn-sm btn-primary" disabled={generating} onClick={handleGenerate}>
            {generating ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="empty-state">
            No reports generated. Click "Generate Report" to create the first monthly summary.
          </div>
        ) : (
          <table>
            <thead><tr><th>Period</th><th>Generated</th><th>Actions</th></tr></thead>
            <tbody>
              {reports.map((rpt, i) => (
                <tr key={rpt.id}>
                  <td style={{ fontWeight: 600 }}>{rpt?.period || '-'}</td>
                  <td className="text-base text-secondary">{formatDate(rpt?.generated_at)}</td>
                  <td>
                    <button className="btn btn-sm btn-primary"
                      onClick={() => handleView(rpt.id)}>
                      {viewReport === rpt.id ? 'Viewing' : 'View'}
                    </button>
                  </td>
                  </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reportHtml && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Report Preview</div>
            <button className="btn btn-sm" onClick={() => { setViewReport(null); setReportHtml(null); }}>Close</button>
          </div>
          <iframe
            srcDoc={reportHtml}
            sandbox="allow-scripts"
            style={{ width: '100%', height: 600, border: 'none', borderRadius: 'var(--radius-sm)', background: '#0f172a' }}
            title="SOC Report"
          />
        </div>
      )}
    </>
  );
}
