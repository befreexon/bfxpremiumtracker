import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compareBenchmark, type BenchmarkResult } from '../../api/client';
import { Card } from '../../design/components';
import type { PortfolioState } from '../../state/portfolioContext';
import { StatCard } from './StatCard';

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

export function BenchmarkPanel({ portfolio }: { portfolio: PortfolioState }) {
  const [data, setData] = useState<BenchmarkResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    compareBenchmark({
      tickers: portfolio.tickers,
      weights: portfolio.weights,
      start_date: portfolio.startDate,
      end_date: portfolio.endDate,
      risk_free_rate: portfolio.riskFreeRate,
      benchmark_ticker: portfolio.benchmarkTicker,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to compare against benchmark.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolio]);

  if (loading) return <div style={{ color: 'var(--on-dark-mute)' }}>Comparing against {portfolio.benchmarkTicker}…</div>;
  if (error) return <div style={{ color: '#e3897f' }}>{error}</div>;
  if (!data) return null;

  const chartData = data.portfolio_curve.map((p, i) => ({
    date: p.date,
    portfolio: p.value,
    benchmark: data.benchmark_curve[i]?.value ?? null,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ fontSize: 13, color: 'var(--on-dark-mute)' }}>
        PORTFOLIO VS {portfolio.benchmarkTicker}
      </div>

      <Card elevated style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} minTickGap={40} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}x`} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: '#2d2f2c', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff' }}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }} />
            <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="#dcb45c" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="benchmark" name={portfolio.benchmarkTicker} stroke="#6f9bc4" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard label="Beta" value={data.metrics.beta.toFixed(2)} />
        <StatCard label="Alpha (annual)" value={pct(data.metrics.alpha)} tone={data.metrics.alpha >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Correlation" value={data.metrics.correlation.toFixed(2)} />
        <StatCard label="R-squared" value={data.metrics.r_squared.toFixed(2)} />
        <StatCard label="Tracking error" value={pct(data.metrics.tracking_error)} />
        <StatCard label="Information ratio" value={data.metrics.information_ratio.toFixed(2)} />
        <StatCard label="Up capture" value={`${data.metrics.up_capture.toFixed(0)}%`} />
        <StatCard label="Down capture" value={`${data.metrics.down_capture.toFixed(0)}%`} />
      </div>
    </div>
  );
}
