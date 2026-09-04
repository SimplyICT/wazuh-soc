import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Command Center', icon: '\u25A0' },
  { path: '/playbooks', label: 'Playbooks', icon: '\u25B6' },
  { path: '/agents', label: 'Agents', icon: '\uD83D\uDCE1' },
  { path: '/fim', label: 'File Integrity', icon: '\u270F' },
  { path: '/vulnerabilities', label: 'Vulnerabilities', icon: '\u26A0' },
  { path: '/mitre', label: 'MITRE ATT&CK', icon: '\u2694' },
  { path: '/rules', label: 'Rules & Decoders', icon: '\u2696' },
  { path: '/events', label: 'Events & Alerts', icon: '\u26A1' },
  { path: '/itdr', label: 'Identity (ITDR)', icon: '\uD83D\uDD12' },
  { path: '/siem', label: 'SIEM', icon: '\u25C9' },
  { path: '/topology', label: 'Topology', icon: '\u267B' },
  { path: '/threats', label: 'Threat Intel', icon: '\u2764' },
  { path: '/edr', label: 'EDR & Response', icon: '\uD83D\uDEE1' },
  { path: '/autopilot', label: 'SOC Autopilot', icon: '\u2601' },
  { path: '/manager', label: 'Manager Health', icon: '\u2605' },
  { path: '/reports', label: 'Reports', icon: '\u25A3' },
  { path: '/compliance', label: 'Compliance', icon: '\u2714' },
  { path: '/groups', label: 'Groups', icon: '\u2602' },
  { path: '/help', label: 'Help', icon: '\u2753' },
  { path: '/organizations', label: 'Organizations', icon: '\uD83C\uDF10' },
  { path: '/users', label: 'Users & Roles', icon: '\uD83D\uDC64' },
  { path: '/webhooks', label: 'Webhooks', icon: '\u2194' },
  { path: '/onboarding', label: 'Onboarding', icon: '\u2728' },
  { path: '/settings', label: 'Settings', icon: '\u2699' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname;

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">&#9733;</span>
          <span className="sidebar-logo-text">SOC</span>
        </div>
        <button className="sidebar-toggle" onClick={onToggle} title="Toggle sidebar">
          {collapsed ? '\u2192' : '\u2190'}
        </button>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <a
            key={item.path}
            className={`nav-item ${activePath === item.path ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); navigate(item.path); }}
            href={`#${item.path}`}
            title={collapsed ? item.label : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-footer">
        <a className="nav-btn-home" href="http://localhost:8095/index-platform.html" target="_blank" rel="noopener noreferrer">
          &#9664; Home
        </a>
      </div>
    </aside>
  );
}
