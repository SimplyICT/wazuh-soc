export default function Help() {
  return (
    <div className="help-page">
      <div className="card">
        <div className="card-header"><div className="card-title">Navigation</div></div>
        <ul className="help-list">
          <li>Use the sidebar to switch between pages. Click the arrow to collapse it.</li>
          <li>Command Center shows KPIs, agent status, OS distribution, and alert severity.</li>
          <li>Click any agent row to drill down into SCA, FIM, Vulnerabilities, and Inventory.</li>
          <li>Events &amp; Alerts shows the real-time feed with severity filtering.</li>
          <li>SOC Autopilot manages AI-generated security cases with approve/reject/execute workflow.</li>
          <li>Threat Intel shows AlienVault OTX integration status and IOC counts.</li>
          <li>Click Refresh in the topbar to reload the current page data.</li>
          <li>Use the search box to find agents by name or IP.</li>
        </ul>
      </div>
    </div>
  );
}
