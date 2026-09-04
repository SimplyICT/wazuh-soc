import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../context/ToastContext';

export default function IsolationBanner({ agentId }) {
  const [state, setState] = useState({ isolated: false, loading: true });
  const [sshStatus, setSshStatus] = useState(null);
  const [deployCmd, setDeployCmd] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [tryingAuto, setTryingAuto] = useState(false);
  const toast = useToast();

  const checkSsh = useCallback(() => {
    Promise.all([
      fetch('/api/edr/summary').then(r => r.json()),
      fetch(`/api/edr/agent/${agentId}/check-ssh`).then(r => r.json()).catch(() => ({ success: false })),
    ])
      .then(([summary, ssh]) => {
        const isolated = (summary.isolated_agents || []).some(i => i.agent_id === agentId);
        setState({ isolated, loading: false });
        setSshStatus(!!ssh.success);
      })
      .catch(() => setState({ isolated: false, loading: false }));
  }, [agentId]);

  useEffect(() => { checkSsh(); }, [checkSsh]);

  const handleAutoConnect = async () => {
    setTryingAuto(true);
    try {
      const res = await fetch(`/api/edr/agent/${agentId}/deploy-key`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setDeployCmd(d);
      const check = await fetch(`/api/edr/agent/${agentId}/check-ssh`);
      if (!check.ok) throw new Error(`HTTP ${check.status}`);
      const c = await check.json();
      if (c.success) { setSshStatus(true); toast('✅ Connected!', 'success'); }
    } catch (e) { toast(`Auto-connect failed: ${e.message}`, 'error'); }
    setTryingAuto(false);
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await fetch(`/api/edr/agent/${agentId}/check-ssh`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (d.success) { setSshStatus(true); toast('✅ EDR ready!', 'success'); }
      else { toast('Not connected yet. Run the command on the agent first.', 'info'); }
    } catch (e) { toast(`Verify failed: ${e.message}`, 'error'); }
    setVerifying(false);
  };

  const handleIsolate = async () => {
    if (!confirm('Isolate this agent?')) return;
    try {
      const res = await fetch(`/api/edr/agent/${agentId}/isolate`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (d.success) { setState(s => ({ ...s, isolated: true })); toast('Isolated', 'success'); }
      else { toast(d.error || 'Failed', 'error'); }
    } catch (e) { toast(`Isolate failed: ${e.message}`, 'error'); }
  };

  const handleRelease = async () => {
    try {
      const res = await fetch(`/api/edr/agent/${agentId}/release`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (d.success) { setState(s => ({ ...s, isolated: false })); toast('Released', 'success'); }
      else { toast(d.error || 'Failed', 'error'); }
    } catch (e) { toast(`Release failed: ${e.message}`, 'error'); }
  };

  if (state.loading) return null;

  const B = {
    box: { padding: '12px 20px', borderRadius: 'var(--radius)', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 },
    red: { background: 'rgba(255,71,87,0.15)', border: '1px solid var(--red)', color: 'var(--red)' },
    green: { background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', color: 'var(--text-secondary)' },
    amber: { background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.3)', color: 'var(--amber)' },
  };

  return (
    <>
      {state.isolated ? (
        <div style={{ ...B.box, ...B.red, flexDirection: 'row', justifyContent: 'space-between' }}>
          <span>&#9888; <strong>Isolated</strong></span>
          <button className="btn btn-sm btn-primary" onClick={handleRelease}>Release</button>
        </div>
      ) : (
        <div style={{ ...B.box, ...B.green, flexDirection: 'row', justifyContent: 'space-between' }}>
          <span>&#128737; Not isolated.</span>
          <button className="btn btn-sm btn-danger" onClick={handleIsolate}>Isolate</button>
        </div>
      )}

      {sshStatus === false && (
        <div style={{ ...B.box, ...B.amber, marginTop: -8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>&#128477; EDR: SSH key not deployed</div>

          <button className="btn btn-sm btn-amber"
            style={{ alignSelf: 'flex-start' }}
            disabled={tryingAuto}
            onClick={handleAutoConnect}>
            {tryingAuto ? 'Trying...' : 'Try Auto-Connect'}
          </button>

          {deployCmd && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Auto-connect failed. To deploy manually:
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
                1. SSH into <strong>{deployCmd.ip}</strong> as <strong>aiagent</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                2. Paste this (it pulls the key from the API, no truncation):
              </div>
              <pre style={{
                background: 'var(--bg)', padding: 14, borderRadius: 8, fontSize: 11,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
                border: '1px solid var(--border)', userSelect: 'all',
              }}>{deployCmd.command}</pre>
            </div>
          )}

          <button className="btn btn-sm btn-primary" disabled={verifying} onClick={handleVerify}>
            {verifying ? 'Checking...' : 'Verify Connection'}
          </button>
        </div>
      )}

      {sshStatus === true && (
        <div style={{ ...B.box, ...B.green, marginTop: -8 }}>
          <span>&#9989; <strong>EDR ready</strong></span>
        </div>
      )}
    </>
  );
}
