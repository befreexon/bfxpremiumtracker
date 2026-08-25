import { useState } from 'react';
import { quant, type QuantInput } from '../../api/client';
import { Card, Select } from '../../design/components';
import { NUMERIC_STYLE, percent, share } from '../../lib/format';
import { PanelState } from './PanelState';
import { StatTile } from './StatTile';
import { useQuant } from './useQuant';

const STRATEGIES: Record<string, string> = {
  max_sharpe: 'Maximální Sharpe',
  min_volatility: 'Minimální volatilita',
  risk_parity: 'Rovnoměrné rozdělení rizika',
};

export function OptimizePanel({ input }: { input: QuantInput }) {
  const [strategy, setStrategy] = useState('max_sharpe');

  const { data, loading, error, reload } = useQuant(
    () =>
      quant.optimize({
        tickers: input.tickers,
        current_weights: input.weights,
        start_date: input.start_date,
        end_date: input.end_date,
        risk_free_rate: input.risk_free_rate,
        strategy,
      }),
    [JSON.stringify(input), strategy],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ maxWidth: 320 }}>
        <Select
          label="Strategie"
          options={Object.values(STRATEGIES)}
          value={STRATEGIES[strategy]}
          onChange={(value) => {
            const key = Object.entries(STRATEGIES).find(([, label]) => label === value)?.[0];
            if (key) setStrategy(key);
          }}
        />
      </div>

      {loading || error || !data ? (
        <PanelState loading={loading} error={error} onRetry={reload} busyLabel="Hledám optimální váhy…" />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <StatTile
              label="Očekávaný výnos"
              value={percent(data.expected_return * 100)}
              signal={data.expected_return}
            />
            <StatTile label="Volatilita" value={percent(data.volatility * 100)} />
            <StatTile label="Sharpe optimalizovaný" value={data.sharpe_ratio.toFixed(2).replace('.', ',')} />
            {data.current && (
              <StatTile
                label="Sharpe současný"
                value={data.current.sharpe_ratio.toFixed(2).replace('.', ',')}
                hint="Tvoje dnešní složení"
              />
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 10 }}>
              OPTIMÁLNÍ VÁHY
            </div>
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
              {Object.entries(data.weights)
                .sort(([, a], [, b]) => b - a)
                .map(([ticker, weight]) => {
                  const currentIndex = input.tickers.indexOf(ticker);
                  const current = currentIndex >= 0 ? input.weights[currentIndex] : null;
                  const delta = current === null ? null : weight - current;

                  return (
                    <div
                      key={ticker}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '13px 20px',
                        background: 'var(--surface-elevated)',
                      }}
                    >
                      <span style={{ fontSize: 15 }}>{ticker}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {delta !== null && Math.abs(delta) > 0.005 && (
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--on-dark-mute)',
                              ...NUMERIC_STYLE,
                              width: 90,
                            }}
                          >
                            dnes {share(current)}
                          </span>
                        )}
                        <div
                          style={{
                            width: 120,
                            height: 6,
                            borderRadius: 'var(--radius-full)',
                            background: 'rgba(255,255,255,0.12)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(weight, 0) * 100}%`,
                              height: '100%',
                              background: 'var(--gold)',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 14, color: 'var(--on-dark-mute)', width: 56, ...NUMERIC_STYLE }}>
                          {share(weight)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <Card>
            <div style={{ color: 'var(--charcoal)', fontSize: 14, lineHeight: 1.55 }}>
              Optimalizace vychází z historických výnosů a korelací ve zvoleném období. Historie se
              neopakuje na povel — výsledek ber jako jeden vstup do rozhodnutí, ne jako pokyn
              k obchodu. Nezohledňuje daně, poplatky ani časový test.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
