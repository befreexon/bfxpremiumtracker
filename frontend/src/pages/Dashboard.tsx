import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.svg';
import { Button, Tabs } from '../design/components';
import { usePortfolio } from '../state/portfolioContext';
import { BenchmarkPanel } from './dashboard/BenchmarkPanel';
import { MonteCarloPanel } from './dashboard/MonteCarloPanel';
import { OptimizePanel } from './dashboard/OptimizePanel';
import { PerformancePanel } from './dashboard/PerformancePanel';

const TABS = ['Performance', 'Benchmark', 'Monte Carlo', 'Optimize'];

export function Dashboard() {
  const { portfolio, hasPortfolio } = usePortfolio();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  if (!hasPortfolio) return <Navigate to="/" replace />;

  return (
    <div style={{ minHeight: '100%', background: 'var(--canvas-dark)', color: '#fff', fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: '1px solid var(--hairline-dark)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt="" style={{ width: 28 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>BFX Portfolio Pro</span>
        </div>
        <Button size="sm" variant="outline-dark" onClick={() => navigate('/')}>
          Edit portfolio
        </Button>
      </div>

      <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960, margin: '0 auto' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 6 }}>HOLDINGS</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {portfolio.tickers.map((ticker, i) => (
              <span
                key={ticker}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: 'var(--surface-elevated)',
                  borderRadius: 'var(--radius-full)',
                  padding: '6px 14px',
                }}
              >
                {ticker} · {(portfolio.weights[i] * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>

        <Tabs items={TABS} active={tab} onChange={setTab} />

        <div>
          {tab === 0 && <PerformancePanel portfolio={portfolio} />}
          {tab === 1 && <BenchmarkPanel portfolio={portfolio} />}
          {tab === 2 && <MonteCarloPanel portfolio={portfolio} />}
          {tab === 3 && <OptimizePanel portfolio={portfolio} />}
        </div>
      </div>
    </div>
  );
}
