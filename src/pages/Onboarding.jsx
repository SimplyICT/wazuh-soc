import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import { useToast } from '../context/ToastContext';
import ErrorState from '../components/ErrorState';

function CodeBlock({ label, code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <pre style={{
        background: 'var(--bg)', padding: 14, borderRadius: 8, fontSize: 11,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
        border: '1px solid var(--border)',
      }}>{code}</pre>
      <button className="btn btn-sm" style={{ marginTop: 4, fontSize: 11 }}
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

export default function Onboarding() {
  const [orgId, setOrgId] = useState('default');
  const [tokenR, setTokenR] = useState(null);
  const toast = useToast();

  const r = useApi(() => fetch(`/api/platform/onboarding?org_id=${orgId}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }), [orgId]);

  const handleCreateToken = async () => {
    try {
      const res = await fetch('/api/platform/tokens', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({org_id: orgId, label: `onboarding-${Date.now()}`}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setTokenR(d);
      toast('Token generated', 'success');
      r.refetch();
    } catch (e) {
      toast(`Failed to create token: ${e.message}`, 'error');
    }
  };

  if (r.loading) return <LoadingSpinner />;
  if (r.error) return <ErrorState message={r.error.message} onRetry={r.refetch} />;

  const data = r.data || {};
  const steps = data.instructions || {};

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Onboarding Wizard</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Organization:</span>
          <input value={orgId} onChange={e => setOrgId(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: 12, width: 120, outline: 'none' }}
          />
        </div>
      </div>

      {!data.deploy_token && (
        <div style={{ padding: 12, background: 'rgba(255,149,0,0.1)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          No deploy token for this org. <button className="btn btn-sm btn-amber" onClick={handleCreateToken}>Generate Token</button>
        </div>
      )}

      {tokenR && (
        <div style={{ padding: 12, background: 'rgba(0,255,136,0.1)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <strong>New token:</strong> <code>{tokenR.token}</code>
          <span style={{ color: 'var(--amber)', marginLeft: 8 }}>Save this — it won't be shown again.</span>
        </div>
      )}

      {data.deploy_token && (
        <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
          Deploy token: <code>{data.deploy_token}</code>
        </div>
      )}

      <h3 style={{ marginBottom: 12 }}>Step 1: Deploy EDR Agent</h3>
      {steps.edr_agent && (
        <>
          <CodeBlock label="Linux (automatic install)" code={steps.edr_agent.linux} />
          <CodeBlock label="Linux (manual)" code={steps.edr_agent.manual} />
        </>
      )}

      <h3 style={{ margin: '16px 0 12px' }}>Step 2: Send SIEM Logs</h3>
      {steps.siem_ingest && (
        <>
          <CodeBlock label="HTTP API" code={steps.siem_ingest.http} />
          <CodeBlock label="Syslog" code={steps.siem_ingest.syslog} />
        </>
      )}

      {steps.m365_itdr && (
        <>
          <h3 style={{ margin: '16px 0 12px' }}>Step 3: Configure M365/ITDR</h3>
          <CodeBlock label="Setup" code={steps.m365_itdr.setup} />
          <CodeBlock label="Environment Variables" code={steps.m365_itdr.env} />
        </>
      )}
    </div>
  );
}
