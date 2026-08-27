import { Fragment } from 'react';
import { Card } from '../../design/components';
import type { QuantInput } from '../../api/client';
import { quant } from '../../api/client';
import { PanelState } from './PanelState';
import { useQuant } from './useQuant';

const GAIN_RGB = '127, 191, 143';
const LOSS_RGB = '227, 137, 127';

function cellBackground(value: number): string {
  const strength = Math.min(1, Math.abs(value));
  const rgb = value >= 0 ? GAIN_RGB : LOSS_RGB;
  return `rgba(${rgb}, ${(strength * 0.55).toFixed(2)})`;
}

function cellText(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/**
 * Pairwise correlation between the same holdings used across the other tabs —
 * how much two titles tend to move together, from -1 (opposite) to +1 (lockstep).
 * Diversification only works between titles that don't move together, so this
 * makes the overlap visible directly rather than leaving it to guesswork.
 */
export function CorrelationPanel({ input }: { input: QuantInput }) {
  const tickers = input.tickers;
  const { data, loading, error, reload } = useQuant(
    () => quant.correlation({ tickers, start_date: input.start_date, end_date: input.end_date }),
    [JSON.stringify(tickers), input.start_date, input.end_date],
    tickers.length >= 2,
  );

  if (tickers.length < 2) {
    return (
      <div style={{ color: 'var(--on-dark-mute)', fontSize: 15, lineHeight: 1.55, maxWidth: 560 }}>
        Korelaci má smysl počítat mezi alespoň dvěma tituly — doplň složení o další titul.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ color: 'var(--on-dark-mute)', fontSize: 14, lineHeight: 1.55, maxWidth: 640, margin: 0 }}>
        Jak moc se dva tituly hýbou stejným směrem na denní bázi, od −1 (přesně opačně) přes 0
        (bez vztahu) po +1 (přesně stejně). Diverzifikace funguje jen mezi tituly, které spolu
        nekorelují.
      </p>

      {loading || error || !data ? (
        <PanelState loading={loading} error={error} onRetry={reload} busyLabel="Počítám korelace…" />
      ) : (
        <Card elevated style={{ overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `120px repeat(${data.tickers.length}, minmax(64px, 1fr))`,
              gap: 2,
              minWidth: data.tickers.length * 64 + 120,
            }}
          >
            <div />
            {data.tickers.map((ticker) => (
              <div
                key={`col-${ticker}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--on-dark-mute)',
                  textAlign: 'center',
                  padding: '6px 4px',
                }}
              >
                {ticker}
              </div>
            ))}

            {data.tickers.map((rowTicker, rowIndex) => (
              <Fragment key={rowTicker}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--on-dark-mute)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 8px',
                  }}
                >
                  {rowTicker}
                </div>
                {data.matrix[rowIndex].map((value, colIndex) => (
                  <div
                    key={`${rowTicker}-${data.tickers[colIndex]}`}
                    title={`${rowTicker} × ${data.tickers[colIndex]}`}
                    style={{
                      background: cellBackground(rowIndex === colIndex ? 1 : value),
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: rowIndex === colIndex ? 700 : 500,
                      textAlign: 'center',
                      padding: '10px 4px',
                      borderRadius: 6,
                    }}
                  >
                    {cellText(value)}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
