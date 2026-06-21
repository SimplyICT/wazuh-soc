import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import NLPanel from './NLPanel';
import { useRefresh } from './RefreshContext';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [nlOpen, setNlOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const { refresh } = useRefresh();

  const handleRefresh = () => {
    refresh();
    setLastUpdated(new Date().toLocaleTimeString());
  };

  return (
    <div className="app-layout">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="main-area">
        <Topbar onRefresh={handleRefresh} lastUpdated={lastUpdated} />
        <div className="content-area">
          <Outlet />
        </div>
      </div>
      <div className="nl-toggle" onClick={() => setNlOpen(o => !o)}>
        {nlOpen ? 'Close' : '\uD83D\uDD0D Ask'}
      </div>
      <NLPanel open={nlOpen} onClose={() => setNlOpen(false)} />
    </div>
  );
}
