import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { runMonteCarlo, type MonteCarloResult } from '../../api/client';
import { Button, Card, Input } from '../../design/components';
import type { PortfolioState } from '../../state/portfolioContext';
import { StatCard } from './StatCard';

const money = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function MonteCarloPanel({ portfolio }: { portfolio: PortfolioState }) {
  const [numSimulations, setNumSimulations] = useState('1000');
  const [timeHorizon, setTimeHorizon] = useState('252');
  const [initialInvestment, setInitialInvestment] = useState('10000');
  const [data, setData] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setLoading(true);
    setError(null);
    runMonteCarlo({
      tickers: portfolio.tickers,
      weights: portfolio.weights,
      start_date: portfolio.startDate,
      end_date: portfolio.endDate,
      risk_free_rate: portfolio.riskFreeRate,
      num_simulations: parseInt(numSimulations, 10) || 1000,
      time_horizon: parseInt(timeHorizon, 10) || 252,
      initial_investment: parseFloat(initialInvestment) || 10000,
    })
      .then(setData)
      .catch((err) => setError(err.message ?? 'Simulation failed.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio]);

  const chartData = data
    ? (data.percentile_bands['50'] ?? []).map((median, i) => ({
        day: i,
        p5: data.percentile_bands['5']?.[i],
        p95: data.percentile_bands['95']?.[i],
        median,
      }))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ width: 160 }}>
          <Input label="Simulations" type="number" value={numSimulations} onChange={(e) => setNumSimulations(e.target.value)} />
        </div>
        <div style={{ width: 160 }}>
          <Input label="Horizon (days)" type="number" value={timeHorizon} onChange={(e) => setTimeHorizon(e.target.value)} />
        </div>
        <div style={{ width: 160 }}>
          <Input label="Initial ($)" type="number" value={initialInvestment} onChange={(e) => setInitialInvestment(e.target.value)} />
        </div>
        <Button variant="primary" onClick={run} disabled={loading}>
          {loading ? 'Simulating…' : 'Run simulation'}
        </Button>
      </div>

      {error && <div style={{ color: '#e3897f' }}>{error}</div>}

      {data && (
        <>
          <Card elevated style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} tickFormatter={(v) => money(v)} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  contentStyle={{ background: '#2d2f2c', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  formatter={(value) => money(Number(value))}
                />
                <Area type="monotone" dataKey={(d: { p5: number; p95: number }) => [d.p5, d.p95]} stroke="none" fill="#dcb45c" fillOpacity={0.15} />
                <Area type="monotone" dataKey="median" stroke="#dcb45c" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <StatCard label="Median final value" value={money(data.final_values.median)} />
            <StatCard label="5th percentile" value={money(data.final_values.percentile_5)} tone="negative" />
            <StatCard label="95th percentile" value={money(data.final_values.percentile_95)} tone="positive" />
            <StatCard label="Probability of loss" value={`${data.final_values.prob_loss.toFixed(1)}%`} />
          </div>
        </>
      )}
    </div>
  );
}
