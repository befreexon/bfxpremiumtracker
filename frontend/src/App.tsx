import { Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { PortfolioBuilder } from './pages/PortfolioBuilder';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PortfolioBuilder />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
