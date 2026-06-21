import { useLocation } from 'react-router-dom';

const PAGE_TITLES = {
  '/': 'Command Center',
  '/agents': 'Agents',
  '/sca': 'SCA Compliance',
  '/fim': 'File Integrity Monitoring',
  '/vulnerabilities': 'Vulnerabilities',
  '/mitre': 'MITRE ATT&CK',
  '/rules': 'Rules & Decoders',
  '/events': 'Events & Alerts',
  '/topology': 'Topology',
  '/threats': 'Threat Intelligence',
  '/autopilot': 'SOC Autopilot',
  '/manager': 'Manager Health',
  '/groups': 'Groups',
  '/help': 'Help',
};

export default function Topbar({ onRefresh, lastUpdated }) {
  const location = useLocation();
  const path = location.pathname;
  const title = PAGE_TITLES[path] || 'Wazuh SOC';

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
