import { useEffect, useState } from 'react';
import { optimizePortfolio, type OptimizeResult } from '../../api/client';
import { Button, Card, Select } from '../../design/components';
import type { PortfolioState } from '../../state/portfolioContext';
import { StatCard } from './StatCard';

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

const STRATEGIES: Record<string, string> = {
  max_sharpe: 'Maximum Sharpe ratio',
  min_volatility: 'Minimum volatility',
  risk_parity: 'Risk parity',
};

export function OptimizePanel({ portfolio }: { portfolio: PortfolioState }) {
  const [strategy, setStrategy] = useState('max_sharpe');
  const [data, setData] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (nextStrategy = strategy) => {
    setLoading(true);
    setError(null);
    optimizePortfolio({
      tickers: portfolio.tickers,
      current_weights: portfolio.weights,
      start_date: portfolio.startDate,
      end_date: portfolio.endDate,
      risk_free_rate: portfolio.riskFreeRate,
      strategy: nextStrategy,
    })
      .then(setData)
      .catch((err) => setError(err.message ?? 'Optimization failed.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio]);

  const handleStrategyChange = (value: string) => {
    const key = Object.entries(STRATEGIES).find(([, label]) => label === value)?.[0] ?? 'max_sharpe';
    setStrategy(key);
    run(key);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ width: 260 }}>
          <Select label="Strategy" options={Object.values(STRATEGIES)} value={STRATEGIES[strategy]} onChange={handleStrategyChange} />
        </div>
        <Button onClick={() => run()} disabled={loading}>
          {loading ? 'Optimizing…' : 'Re-run'}
        </Button>
      </div>

      {error && <div style={{ color: '#e3897f' }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <StatCard label="Expected return" value={pct(data.expected_return)} tone={data.expected_return >= 0 ? 'positive' : 'negative'} />
            <StatCard label="Volatility" value={pct(data.volatility)} />
            <StatCard label="Sharpe ratio" value={data.sharpe_ratio.toFixed(2)} />
            {data.current && <StatCard label="Current Sharpe" value={data.current.sharpe_ratio.toFixed(2)} />}
          </div>

          <div>
            <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 10 }}>OPTIMAL WEIGHTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--hairline-dark)', borderRadius: 16, overflow: 'hidden' }}>
              {Object.entries(data.weights)
                .sort(([, a], [, b]) => b - a)
                .map(([ticker, weight]) => (
                  <div key={ticker} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: 'var(--surface-elevated)' }}>
                    <span style={{ fontSize: 15, color: '#fff' }}>{ticker}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 120, height: 6, borderRadius: 'var(--radius-full)', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(weight, 0) * 100}%`, height: '100%', background: 'var(--gold)' }} />
                      </div>
                      <span style={{ fontSize: 14, color: 'var(--on-dark-mute)', width: 48, textAlign: 'right' }}>{pct(weight)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <Card padding={24}>
            <div style={{ color: 'var(--charcoal)', fontSize: 14, lineHeight: 1.5 }}>
              Optimization is mean-variance based on historical returns over your selected date range. It is
              not investment advice — past performance does not guarantee future results.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
