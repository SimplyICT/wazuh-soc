import { SERVER_BASE_URL } from '../config';
export default function Help() {
  return (
    <div className="help-page">
      <div className="card">
        <div className="card-header"><div className="card-title">Navigation</div></div>
        <ul className="help-list">
          <li>Use the sidebar to switch between pages. Click the arrow icon to collapse it.</li>
          <li>Click <strong>Refresh</strong> in the topbar to reload all data on the current page.</li>
        </ul>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Pages Overview</div></div>
        <ul className="help-list">
          <li><strong>Command Center</strong> — Dashboard with live KPIs: agents online, critical alerts, identity events, SIEM logs, detection rules, and SOC queue status.</li>
          <li><strong>SOC Queue</strong> — Human review queue with SLA tracking, analyst assignment, escalation, and case notes.</li>
          <li><strong>Our Agents</strong> — Cross-platform agent inventory (Windows, Linux, macOS). Deploy, select, and push updates from here.</li>
          <li><strong>EDR</strong> — Endpoint Detection & Response. Process tree, persistence scanning, network connections with GeoIP, isolation, file quarantine.</li>
          <li><strong>ITDR</strong> — Identity Threat Detection & Response. Monitors M365 sign-in logs, audit logs, and risk detections via Microsoft Graph API. 9 detection rules including MFA fatigue, impossible travel, privileged role assignment, and OAuth consent monitoring.</li>
          <li><strong>SIEM</strong> — Log ingestion via HTTP POST or Syslog. Query logs by source, severity, and search terms. Cross-source correlation engine with 3 rules.</li>
          <li><strong>FIM</strong> — File Integrity Monitoring. Watches critical system files (passwd, shadow, sshd_config, etc.) and reports changes with severity ratings.</li>
          <li><strong>Vulnerabilities</strong> — CVE matching against installed packages. Agent collects package inventory (dpkg, pip, Windows Programs), server matches against NVD database.</li>
          <li><strong>MITRE ATT&CK</strong> — Live detection-to-MITRE mapping. Shows which tactics and techniques are being hit by current detections.</li>
          <li><strong>Rules & Decoders</strong> — Correlation rule composer. Create custom rules (cross-source, port scan, severity spike). Import rules from XML, Sigma YAML, or generic JSON.</li>
          <li><strong>Playbooks</strong> — Automation playbooks. Build if-then-action chains: "if critical EDR detection → isolate host + notify Slack". Auto-triggers from ITDR and SIEM detections.</li>
          <li><strong>Reports</strong> — Monthly SOC report generator. Aggregates EDR, ITDR, SIEM data into a single HTML report with executive summary.</li>
          <li><strong>Compliance</strong> — PCI-DSS v4.0, HIPAA, and SOC 2 scorecards with per-requirement pass/fail scoring.</li>
          <li><strong>Threat Intel</strong> — IOC feed from AlienVault OTX. Query by type (IP, domain, hash, URL) with multi-source aggregation.</li>
          <li><strong>Settings</strong> — Integration configuration (VirusTotal, Slack, Telegram, M365, MISP). General settings and VirusTotal hash lookup tool.</li>
          <li><strong>Events</strong> — Unified event feed from SIEM logs and ITDR events. Filter by severity and search by text.</li>
          <li><strong>Agents</strong> — Legacy agent inventory. Our agents are managed under "Our Agents".</li>
        </ul>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Agent Deployment</div></div>
        <ul className="help-list">
          <li><strong>Windows (recommended):</strong> <code>cmd /c "curl -o install.cmd {SERVER_BASE_URL}/api/agent/install/windows-batch && install.cmd"</code></li>
          <li><strong>Windows (RMM):</strong> <code>powershell -Command "(New-Object Net.WebClient).DownloadString('{SERVER_BASE_URL}/api/agent/install/windows-oneliner') | iex"</code></li>
          <li><strong>Linux:</strong> <code>curl -s {SERVER_BASE_URL}/api/edr/install | sudo bash</code></li>
          <li><strong>macOS:</strong> <code>curl -sL {SERVER_BASE_URL}/api/agent/install/macos | sudo bash</code></li>
          <li>After deploying, check <strong>Our Agents</strong> page. It appears online within 30 seconds.</li>
          <li>To update agents, select them on the Our Agents page and click <strong>Update</strong>.</li>
        </ul>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">API Reference</div></div>
        <ul className="help-list">
          <li><strong>Dashboard:</strong> <code>GET /api/dashboard</code> — aggregated data from all sources</li>
          <li><strong>Agents:</strong> <code>GET /api/agents/online</code>, <code>GET /api/agents/all</code></li>
          <li><strong>EDR:</strong> <code>GET /api/edr/agent/{id}/process-tree</code>, <code>GET /api/edr/agent/{id}/persistence</code></li>
          <li><strong>ITDR:</strong> <code>GET /api/itdr/summary</code>, <code>POST /api/itdr/detect</code></li>
          <li><strong>SIEM:</strong> <code>POST /api/siem/ingest</code> — send logs, <code>GET /api/siem/logs</code> — query</li>
          <li><strong>VirusTotal:</strong> <code>GET /api/tools/virustotal/{sha256}</code></li>
          <li><strong>Rules:</strong> <code>GET /api/rules</code>, <code>POST /api/rules</code>, <code>POST /api/rules/import/sigma</code></li>
          <li><strong>Playbooks:</strong> <code>GET /api/playbooks</code>, <code>POST /api/playbooks/test</code></li>
          <li><strong>Compliance:</strong> <code>GET /api/compliance/overview</code></li>
          <li><strong>Onboarding:</strong> <code>GET /api/platform/onboarding</code></li>
        </ul>
      </div>
    </div>
  );
}
