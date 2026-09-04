import { useLocation } from 'react-router-dom';

const PAGE_TITLES = {
  '/': 'SOC Command Center',
  '/playbooks': 'Automation Playbooks',
  '/queue': 'SOC Queue',
  '/agents': 'Agents',
  '/our-agents': 'Agents',
  '/sca': 'SCA Compliance',
  '/fim': 'File Integrity Monitoring',
  '/vulnerabilities': 'Vulnerabilities',
  '/mitre': 'MITRE ATT&CK',
  '/rules': 'Rules & Decoders',
  '/events': 'Events & Alerts',
  '/topology': 'Topology',
  '/threats': 'Threat Intelligence',
  '/itdr': 'Identity Threat Detection (ITDR)',
  '/autopilot': 'SOC Autopilot',
  '/siem': 'SIEM Log Ingestion',
  '/edr': 'EDR & Response',
  '/manager': 'Manager Health',
  '/reports': 'SOC Reports',
  '/compliance': 'Compliance',
  '/settings': 'Settings & Integrations',
  '/organizations': 'Organizations',
  '/users': 'Users & Roles',
  '/webhooks': 'Webhooks',
  '/onboarding': 'Onboarding Wizard',
  '/groups': 'Groups',
  '/help': 'Help',
};

export default function Topbar({ onRefresh, lastUpdated }) {
  const location = useLocation();
  const path = location.pathname;
  const title = PAGE_TITLES[path] || 'SOC';

  return (
    <div className="topbar">
      <div className="topbar-left">
        <h1>{title}</h1>
      </div>
      <div className="topbar-right">
        {lastUpdated && <span className="last-updated">Updated: {lastUpdated}</span>}
        <button className="btn" onClick={onRefresh}>&#8635; Refresh</button>
        <a className="nav-btn" href="http://localhost:8095/help.html" target="_blank" rel="noopener noreferrer">? Help</a>
        <a className="nav-btn" href="http://localhost:8095/devdocs.html" target="_blank" rel="noopener noreferrer">DevDocs</a>
      </div>
    </div>
  );
}
