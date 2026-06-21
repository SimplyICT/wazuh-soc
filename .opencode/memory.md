# Wazuh SOC — Session Memory

## 2026-06-21: Full Build

Built a standalone React Vite SPA replacing monolithic `wazuh-soc.html` (67KB).

**Architecture:** React 18 + React Router v6 (hash routing) + Chart.js + react-window. Vite dev server proxies `/wazuh-api` → Python server on `localhost:8095`.

**Location:** `/home/aiagent/wazuh-soc/` — sibling to `mission-control-ui`

**GitHub:** https://github.com/SimplyICT/wazuh-soc

**17 pages:** Dashboard, Agents (virtual scroll), AgentDetail (5 tabs: overview/SCA/FIM/vulns/inventory), SCA, FIM, Vulns, MITRE, Rules, Events, Topology, Threats (OTX/filter/search/CSV), Autopilot, Case Detail, Manager, Groups, AlertDetail, Help

**11 shared components:** Layout, Sidebar, Topbar, KpiCard, DataTable (sortable), StatusBadge, SeverityBadge, FilterTabs, LoadingSpinner, ErrorState, EmptyState, NLPanel, CaseStatusBadge, ToastContext, RefreshContext

**Key fixes applied:**
- Hardcoded API key removed — proxied via `/remediation-api` → `localhost:8000`
- `dangerouslySetInnerHTML` eliminated — React components replace HTML strings
- react-window uses div-based layout (not `<tbody>`) — valid HTML
- Refresh button uses RefreshContext instead of `navigate(0)`

**Run dev:** `bun run dev` (proxies `/wazuh-api` to `localhost:8095`)
**Build:** `bun run build` → `dist/`

**To update `index-platform.html` link:** Point `/wazuh-soc.html` to `http://localhost:5173` (dev) or served `dist/` via Python.
