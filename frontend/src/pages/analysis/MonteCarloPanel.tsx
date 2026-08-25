import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { quant, type QuantInput } from '../../api/client';
import { Button, Card, Input } from '../../design/components';
import { czk, percent } from '../../lib/format';
import { AXIS_PROPS, GRID, SERIES_PRIMARY, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './chartTheme';
import { PanelState } from './PanelState';
import { StatTile } from './StatTile';
import { useQuant } from './useQuant';

export function MonteCarloPanel({ input }: { input: QuantInput }) {
  const [simulations, setSimulations] = useState('1000');
  const [horizon, setHorizon] = useState('252');
  const [initial, setInitial] = useState('100000');
  const [settings, setSettings] = useState({
    num_simulations: 1000,
    time_horizon: 252,
    initial_investment: 100000,
  });

  const { data, loading, error, reload } = useQuant(
    () => quant.monteCarlo({ ...input, ...settings }),
    [JSON.stringify(input), JSON.stringify(settings)],
  );

  const apply = () =>
    setSettings({
      num_simulations: Number(simulations) || 1000,
      time_horizon: Number(horizon) || 252,
      initial_investment: Number(initial) || 100000,
    });

  const bands = data
    ? (data.percentile_bands['50'] ?? []).map((median, index) => ({
        day: index,
        median,
        range: [data.percentile_bands['5']?.[index] ?? median, data.percentile_bands['95']?.[index] ?? median],
      }))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ width: 150 }}>
          <Input label="Počet simulací" type="number" value={simulations} onChange={(e) => setSimulations(e.target.value)} />
        </div>
        <div style={{ width: 170 }}>
          <Input label="Horizont (obch. dny)" type="number" value={horizon} onChange={(e) => setHorizon(e.target.value)} />
        </div>
        <div style={{ width: 170 }}>
          <Input label="Počáteční částka (Kč)" type="number" value={initial} onChange={(e) => setInitial(e.target.value)} />
        </div>
        <Button onClick={apply} disabled={loading}>
          {loading ? 'Simuluji…' : 'Spustit simulaci'}
        </Button>
      </div>

      {loading || error || !data ? (
        <PanelState loading={loading} error={error} onRetry={reload} busyLabel="Simuluji možné vývoje…" />
      ) : (
        <>
          <Card elevated style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bands} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="day" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} width={78} tickFormatter={(value) => czk(Number(value))} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(value) =>
                    Array.isArray(value)
                      ? `${czk(Number(value[0]))} – ${czk(Number(value[1]))}`
                      : czk(Number(value))
                  }
                  labelFormatter={(day) => `Den ${day}`}
                />
                <Area type="monotone" dataKey="range" stroke="none" fill={SERIES_PRIMARY} fillOpacity={0.15} />
                <Area type="monotone" dataKey="median" stroke={SERIES_PRIMARY} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <StatTile label="Medián na konci" value={czk(data.final_values.median)} />
            <StatTile label="5. percentil" value={czk(data.final_values.percentile_5)} hint="Nepříznivý scénář" />
            <StatTile label="95. percentil" value={czk(data.final_values.percentile_95)} hint="Příznivý scénář" />
            <StatTile
              label="Pravděpodobnost ztráty"
              value={percent(data.final_values.prob_loss, 1)}
              hint="Konec pod vloženou částkou"
            />
          </div>

          <p style={{ color: 'var(--on-dark-mute)', fontSize: 13, lineHeight: 1.55, margin: 0, maxWidth: 680 }}>
            Rozptyl je odvozený z historické volatility a korelací, ne z předpovědi. Pás mezi 5. a
            95. percentilem říká, jak široké je pásmo možných konců — ne kde konec bude.
          </p>
        </>
      )}
    </div>
  );
}
