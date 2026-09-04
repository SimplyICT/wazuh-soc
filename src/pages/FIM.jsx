export default function FIM() {
  return (
    <div className="card">
      <div className="empty-state">
        <div style={{ marginBottom: 8 }}>&#128736; FIM coming to our agent</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
          File Integrity Monitoring will be available in a future agent update.
          Critical system files will be monitored for unauthorized changes.
        </p>
        <a className="btn btn-sm btn-primary" href="#/our-agents" style={{ marginTop: 16, display: 'inline-block' }}>
          Deploy Our Agent
        </a>
      </div>
    </div>
  );
}
