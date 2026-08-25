import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { quant, type QuantInput } from '../../api/client';
import { Card } from '../../design/components';
import { NUMERIC_STYLE, TONE_COLOR_ON_DARK, arrowFor, percent, share, toneFor } from '../../lib/format';
import { AXIS_PROPS, GRID, SERIES_PRIMARY, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './chartTheme';
import { PanelState } from './PanelState';
import { StatTile } from './StatTile';
import { useQuant } from './useQuant';

export function PerformancePanel({ input }: { input: QuantInput }) {
  const { data, loading, error, reload } = useQuant(() => quant.analyze(input), [JSON.stringify(input)]);

  if (loading || error || !data) {
    return <PanelState loading={loading} error={error} onRetry={reload} busyLabel="Počítám výkonnost…" />;
  }

  const curve = data.equity_curve.map((point) => ({ date: point.date, value: point.value }));
  const totalReturn = curve.length ? curve[curve.length - 1].value - 1 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 6 }}>
          CELKOVÝ VÝNOS ZA OBDOBÍ
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            letterSpacing: '-0.9px',
            color: TONE_COLOR_ON_DARK[toneFor(totalReturn)],
            ...NUMERIC_STYLE,
            textAlign: 'left',
          }}
        >
          {arrowFor(totalReturn)} {percent(totalReturn * 100, 2, { withSign: true })}
        </div>
      </div>

      <Card elevated style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_PRIMARY} stopOpacity={0.35} />
                <stop offset="100%" stopColor={SERIES_PRIMARY} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" {...AXIS_PROPS} minTickGap={40} />
            <YAxis {...AXIS_PROPS} width={44} tickFormatter={(value) => `${Number(value).toFixed(1)}×`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(value) => [`${Number(value).toFixed(3)}×`, 'Růst 1 Kč']}
            />
            <Area type="monotone" dataKey="value" stroke={SERIES_PRIMARY} strokeWidth={2} fill="url(#equityFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatTile
          label="Roční výnos"
          value={percent(data.metrics.annual_return * 100)}
          signal={data.metrics.annual_return}
        />
        <StatTile label="Volatilita" value={percent(data.metrics.annual_volatility * 100)} />
        <StatTile
          label="Sharpe"
          value={data.metrics.sharpe_ratio.toFixed(2).replace('.', ',')}
          hint="Výnos na jednotku rizika"
        />
        <StatTile
          label="Sortino"
          value={data.metrics.sortino_ratio.toFixed(2).replace('.', ',')}
          hint="Trestá jen pokles"
        />
        <StatTile
          label="Max. propad"
          value={percent(data.metrics.max_drawdown * 100)}
          signal={data.metrics.max_drawdown}
        />
      </div>

      <div>
        <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 10 }}>SLOŽENÍ</div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            background: 'var(--hairline-dark)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {data.allocation.map((slice) => (
            <div
              key={slice.ticker}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '13px 20px',
                background: 'var(--surface-elevated)',
              }}
            >
              <span style={{ fontSize: 15 }}>{slice.ticker}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 120,
                    height: 6,
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(255,255,255,0.12)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ width: `${slice.weight * 100}%`, height: '100%', background: 'var(--gold)' }} />
                </div>
                <span
                  style={{ fontSize: 14, color: 'var(--on-dark-mute)', width: 56, ...NUMERIC_STYLE }}
                >
                  {share(slice.weight)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
