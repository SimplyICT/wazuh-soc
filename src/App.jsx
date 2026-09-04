import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const AgentDetail = lazy(() => import('./pages/AgentDetail'));
const SCA = lazy(() => import('./pages/SCA'));
const Vulnerabilities = lazy(() => import('./pages/Vulnerabilities'));
const Mitre = lazy(() => import('./pages/Mitre'));
const Rules = lazy(() => import('./pages/Rules'));
const Events = lazy(() => import('./pages/Events'));
const Topology = lazy(() => import('./pages/Topology'));
const Threats = lazy(() => import('./pages/Threats'));
const Edr = lazy(() => import('./pages/Edr'));
const Itdr = lazy(() => import('./pages/Itdr'));
const Siem = lazy(() => import('./pages/Siem'));
const Reports = lazy(() => import('./pages/Reports'));
const CompliancePg = lazy(() => import('./pages/Compliance'));
const Organizations = lazy(() => import('./pages/Organizations'));
const UsersPg = lazy(() => import('./pages/Users'));
const WebhooksPg = lazy(() => import('./pages/Webhooks'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const OurAgents = lazy(() => import('./pages/OurAgents'));
const SettingsPg = lazy(() => import('./pages/Settings'));
const FimPg = lazy(() => import('./pages/Fim'));
const Autopilot = lazy(() => import('./pages/Autopilot'));
const PlaybooksPg = lazy(() => import('./pages/Playbooks'));
const AutopilotCase = lazy(() => import('./pages/AutopilotCase'));
const Manager = lazy(() => import('./pages/Manager'));
const Groups = lazy(() => import('./pages/Groups'));
const AlertDetail = lazy(() => import('./pages/AlertDetail'));
const Help = lazy(() => import('./pages/Help'));

function SuspenseWrapper({ children }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SuspenseWrapper><Dashboard /></SuspenseWrapper>} />
        <Route path="playbooks" element={<SuspenseWrapper><PlaybooksPg /></SuspenseWrapper>} />
        <Route path="fim" element={<SuspenseWrapper><FimPg /></SuspenseWrapper>} />
        <Route path="agents" element={<SuspenseWrapper><OurAgents /></SuspenseWrapper>} />
        <Route path="our-agents" element={<SuspenseWrapper><OurAgents /></SuspenseWrapper>} />
        <Route path="settings" element={<SuspenseWrapper><SettingsPg /></SuspenseWrapper>} />
        <Route path="agent/:id" element={<SuspenseWrapper><AgentDetail /></SuspenseWrapper>} />
        <Route path="sca" element={<SuspenseWrapper><SCA /></SuspenseWrapper>} />
        <Route path="vulnerabilities" element={<SuspenseWrapper><Vulnerabilities /></SuspenseWrapper>} />
        <Route path="mitre" element={<SuspenseWrapper><Mitre /></SuspenseWrapper>} />
        <Route path="rules" element={<SuspenseWrapper><Rules /></SuspenseWrapper>} />
        <Route path="events" element={<SuspenseWrapper><Events /></SuspenseWrapper>} />
        <Route path="topology" element={<SuspenseWrapper><Topology /></SuspenseWrapper>} />
        <Route path="threats" element={<SuspenseWrapper><Threats /></SuspenseWrapper>} />
        <Route path="edr" element={<SuspenseWrapper><Edr /></SuspenseWrapper>} />
        <Route path="siem" element={<SuspenseWrapper><Siem /></SuspenseWrapper>} />
        <Route path="itdr" element={<SuspenseWrapper><Itdr /></SuspenseWrapper>} />
        <Route path="reports" element={<SuspenseWrapper><Reports /></SuspenseWrapper>} />
        <Route path="compliance" element={<SuspenseWrapper><CompliancePg /></SuspenseWrapper>} />
        <Route path="organizations" element={<SuspenseWrapper><Organizations /></SuspenseWrapper>} />
        <Route path="users" element={<SuspenseWrapper><UsersPg /></SuspenseWrapper>} />
        <Route path="webhooks" element={<SuspenseWrapper><WebhooksPg /></SuspenseWrapper>} />
        <Route path="onboarding" element={<SuspenseWrapper><Onboarding /></SuspenseWrapper>} />
        <Route path="autopilot" element={<SuspenseWrapper><Autopilot /></SuspenseWrapper>} />
        <Route path="autopilot/case/:id" element={<SuspenseWrapper><AutopilotCase /></SuspenseWrapper>} />
        <Route path="manager" element={<SuspenseWrapper><Manager /></SuspenseWrapper>} />
        <Route path="groups" element={<SuspenseWrapper><Groups /></SuspenseWrapper>} />
        <Route path="alert/:id" element={<SuspenseWrapper><AlertDetail /></SuspenseWrapper>} />
        <Route path="help" element={<SuspenseWrapper><Help /></SuspenseWrapper>} />
      </Route>
    </Routes>
  );
}
