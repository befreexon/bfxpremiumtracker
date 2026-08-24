import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyzePortfolio, type AnalyzeResult } from '../../api/client';
import { Card } from '../../design/components';
import type { PortfolioState } from '../../state/portfolioContext';
import { StatCard } from './StatCard';

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

export function PerformancePanel({ portfolio }: { portfolio: PortfolioState }) {
  const [data, setData] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyzePortfolio({
      tickers: portfolio.tickers,
      weights: portfolio.weights,
      start_date: portfolio.startDate,
      end_date: portfolio.endDate,
      risk_free_rate: portfolio.riskFreeRate,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to analyze portfolio.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolio]);

  if (loading) return <div style={{ color: 'var(--on-dark-mute)' }}>Crunching the numbers…</div>;
  if (error) return <div style={{ color: '#e3897f' }}>{error}</div>;
  if (!data) return null;

  const chartData = data.equity_curve.map((p) => ({ date: p.date, value: p.value }));
  const totalReturn = data.equity_curve.length
    ? data.equity_curve[data.equity_curve.length - 1].value - 1
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 6 }}>TOTAL RETURN</div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            letterSpacing: '-0.9px',
            color: totalReturn >= 0 ? '#7fbf8f' : '#e3897f',
          }}
        >
          {totalReturn >= 0 ? '+' : ''}
          {pct(totalReturn)}
        </div>
      </div>

      <Card elevated style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dcb45c" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#dcb45c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} minTickGap={40} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              tickFormatter={(v) => `${v.toFixed(1)}x`}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{ background: '#2d2f2c', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff' }}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
              formatter={(value) => [`${Number(value).toFixed(3)}x`, 'Growth of $1']}
            />
            <Area type="monotone" dataKey="value" stroke="#dcb45c" strokeWidth={2} fill="url(#equityFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard label="Annual return" value={pct(data.metrics.annual_return)} tone={data.metrics.annual_return >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Volatility" value={pct(data.metrics.annual_volatility)} />
        <StatCard label="Sharpe ratio" value={data.metrics.sharpe_ratio.toFixed(2)} />
        <StatCard label="Sortino ratio" value={data.metrics.sortino_ratio.toFixed(2)} />
        <StatCard label="Max drawdown" value={pct(data.metrics.max_drawdown)} tone="negative" />
      </div>

      <div>
        <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 10 }}>ALLOCATION</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--hairline-dark)', borderRadius: 16, overflow: 'hidden' }}>
          {data.allocation.map((slice) => (
            <div key={slice.ticker} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: 'var(--surface-elevated)' }}>
              <span style={{ fontSize: 15, color: '#fff' }}>{slice.ticker}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 120, height: 6, borderRadius: 'var(--radius-full)', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                  <div style={{ width: `${slice.weight * 100}%`, height: '100%', background: 'var(--gold)' }} />
                </div>
                <span style={{ fontSize: 14, color: 'var(--on-dark-mute)', width: 48, textAlign: 'right' }}>{pct(slice.weight)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
