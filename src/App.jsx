import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Agents = lazy(() => import('./pages/Agents'));
const AgentDetail = lazy(() => import('./pages/AgentDetail'));
const SCA = lazy(() => import('./pages/SCA'));
const FIM = lazy(() => import('./pages/FIM'));
const Vulnerabilities = lazy(() => import('./pages/Vulnerabilities'));
const Mitre = lazy(() => import('./pages/Mitre'));
const Rules = lazy(() => import('./pages/Rules'));
const Events = lazy(() => import('./pages/Events'));
const Topology = lazy(() => import('./pages/Topology'));
const Threats = lazy(() => import('./pages/Threats'));
const Autopilot = lazy(() => import('./pages/Autopilot'));
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
        <Route path="agents" element={<SuspenseWrapper><Agents /></SuspenseWrapper>} />
        <Route path="agent/:id" element={<SuspenseWrapper><AgentDetail /></SuspenseWrapper>} />
        <Route path="sca" element={<SuspenseWrapper><SCA /></SuspenseWrapper>} />
        <Route path="fim" element={<SuspenseWrapper><FIM /></SuspenseWrapper>} />
        <Route path="vulnerabilities" element={<SuspenseWrapper><Vulnerabilities /></SuspenseWrapper>} />
        <Route path="mitre" element={<SuspenseWrapper><Mitre /></SuspenseWrapper>} />
        <Route path="rules" element={<SuspenseWrapper><Rules /></SuspenseWrapper>} />
        <Route path="events" element={<SuspenseWrapper><Events /></SuspenseWrapper>} />
        <Route path="topology" element={<SuspenseWrapper><Topology /></SuspenseWrapper>} />
        <Route path="threats" element={<SuspenseWrapper><Threats /></SuspenseWrapper>} />
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
