import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { quant, type QuantInput } from '../../api/client';
import { Card, Select } from '../../design/components';
import { percent } from '../../lib/format';
import {
  AXIS_PROPS,
  GRID,
  SERIES_PRIMARY,
  SERIES_SECONDARY,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from './chartTheme';
import { PanelState } from './PanelState';
import { StatTile } from './StatTile';
import { useQuant } from './useQuant';

const BENCHMARKS: Record<string, string> = {
  SPY: 'S&P 500 (US velké firmy)',
  VTI: 'Celý americký trh',
  VT: 'Celý světový trh',
  BND: 'Americké dluhopisy',
  QQQ: 'NASDAQ 100',
  IWM: 'Russell 2000 (US malé firmy)',
  EFA: 'Vyspělé trhy mimo USA',
  AGG: 'Americké agregované dluhopisy',
};

export function BenchmarkPanel({ input }: { input: QuantInput }) {
  const [ticker, setTicker] = useState('SPY');
  const { data, loading, error, reload } = useQuant(
    () => quant.benchmark({ ...input, benchmark_ticker: ticker }),
    [JSON.stringify(input), ticker],
  );

  const label = (key: string) => `${key} — ${BENCHMARKS[key] ?? ''}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ maxWidth: 320 }}>
        <Select
          label="Benchmark"
          options={Object.keys(BENCHMARKS).map(label)}
          value={label(ticker)}
          onChange={(value) => setTicker(value.split(' — ')[0])}
        />
      </div>

      {loading || error || !data ? (
        <PanelState loading={loading} error={error} onRetry={reload} busyLabel={`Porovnávám s ${ticker}…`} />
      ) : (
        <>
          <Card elevated style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.portfolio_curve.map((point, index) => ({
                  date: point.date,
                  portfolio: point.value,
                  benchmark: data.benchmark_curve[index]?.value ?? null,
                }))}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" {...AXIS_PROPS} minTickGap={40} />
                <YAxis {...AXIS_PROPS} width={44} tickFormatter={(value) => `${Number(value).toFixed(1)}×`} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(value) => `${Number(value).toFixed(3)}×`}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }} />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  name="Portfolio"
                  stroke={SERIES_PRIMARY}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name={ticker}
                  stroke={SERIES_SECONDARY}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <StatTile
              label="Beta"
              value={data.metrics.beta.toFixed(2).replace('.', ',')}
              hint="Citlivost na pohyb trhu"
            />
            <StatTile
              label="Alfa (ročně)"
              value={percent(data.metrics.alpha * 100, 2, { withSign: true })}
              signal={data.metrics.alpha}
              hint="Nad rámec toho, co vysvětlí trh"
            />
            <StatTile label="Korelace" value={data.metrics.correlation.toFixed(2).replace('.', ',')} />
            <StatTile
              label="R²"
              value={data.metrics.r_squared.toFixed(2).replace('.', ',')}
              hint="Kolik pohybu vysvětlí benchmark"
            />
            <StatTile label="Tracking error" value={percent(data.metrics.tracking_error * 100)} />
            <StatTile
              label="Informační poměr"
              value={data.metrics.information_ratio.toFixed(2).replace('.', ',')}
              signal={data.metrics.information_ratio}
            />
            <StatTile
              label="Zachycení růstu"
              value={percent(data.metrics.up_capture, 0)}
              hint="Kolik z růstu trhu portfolio chytí"
            />
            <StatTile
              label="Zachycení poklesu"
              value={percent(data.metrics.down_capture, 0)}
              hint="Méně je lépe"
            />
          </div>
        </>
      )}
    </div>
  );
}
