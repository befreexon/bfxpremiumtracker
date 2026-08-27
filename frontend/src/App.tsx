import { Navigate, Route, Routes } from 'react-router-dom';
import { AiLayer } from './pages/ai';
import { AnalysisLayer } from './pages/analysis';
import { AppShell } from './pages/AppShell';
import { MarketsLayer } from './pages/markets';
import { NetWorthLayer } from './pages/networth';
import { PortfolioLayer } from './pages/portfolio';
import { AnnualReport } from './pages/report/AnnualReport';
import { Settings } from './pages/Settings';
import { SignIn } from './pages/SignIn';
import { WatchlistLayer } from './pages/watchlist';
import { useAuth } from './state/authContext';

export function App() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;
  if (!user) return <SignIn />;

  return (
    <Routes>
      <Route path="/vyrocni-zprava" element={<AnnualReport />} />
      <Route element={<AppShell />}>
        <Route path="/portfolio" element={<PortfolioLayer />} />
        <Route path="/watchlist" element={<WatchlistLayer />} />
        <Route path="/analyza" element={<AnalysisLayer />} />
        <Route path="/ai" element={<AiLayer />} />
        <Route path="/trhy" element={<MarketsLayer />} />
        <Route path="/jmeni" element={<NetWorthLayer />} />
        <Route path="/nastaveni" element={<Settings />} />
        <Route path="*" element={<Navigate to="/portfolio" replace />} />
      </Route>
    </Routes>
  );
}

function Splash() {
  return (
    <div
      style={{
        minHeight: '100%',
        background: 'var(--canvas-dark)',
        color: 'var(--on-dark-mute)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-body)',
        fontSize: 15,
      }}
    >
      Načítám…
    </div>
  );
}
