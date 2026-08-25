import type { Projection } from '../../api/types';
import { TONE_COLOR_ON_DARK, arrowFor, toneFor } from '../../lib/format';
import { horizonText, priceText, signedPercentText } from './formatting';
import { DARK, NoteBlock, Panel, Row, ScaleBar, StatTile } from './primitives';

/**
 * The percentile fan.
 *
 * The median is deliberately not given more visual weight than the band around
 * it. A single line down the middle reads as a prediction, which is exactly what
 * this is not.
 */
export function ProjectionPanel({
  projection,
  currency,
}: {
  projection: Projection | null;
  currency: string | null;
}) {
  if (!projection) {
    return (
      <Panel title="Projekce">
        <NoteBlock>
          Projekci nešlo spočítat — chybí dost historie k odhadu rozptylu.
        </NoteBlock>
      </Panel>
    );
  }

  const { p5, p25, median, p75, p95, start_price: start } = projection;
  const values = [p5, p25, median, p75, p95, start].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const hasBand = p5 !== null && p95 !== null && values.length > 0;
  const min = hasBand ? Math.min(...values) : 0;
  const max = hasBand ? Math.max(...values) : 1;

  return (
    <Panel
      title="Projekce"
      subtitle={`Rozdělení konců za ${horizonText(projection.horizon_days)} · ${projection.paths.toLocaleString('cs-CZ')} simulací`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {hasBand && (
          <div>
            <ScaleBar
              min={min}
              max={max}
              bands={[
                { from: p5, to: p95, color: 'rgba(220,180,92,0.14)' },
                ...(p25 !== null && p75 !== null
                  ? [{ from: p25, to: p75, color: 'rgba(220,180,92,0.28)' }]
                  : []),
              ]}
              markers={[
                ...(start !== null
                  ? [{ value: start, color: DARK.faint, caption: `dnes ${priceText(start, currency)}` }]
                  : []),
                ...(median !== null
                  ? [{ value: median, color: DARK.gold, caption: `medián ${priceText(median, currency)}` }]
                  : []),
              ]}
              height={14}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 10,
                fontSize: 12,
                color: DARK.mute,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>5. percentil {priceText(p5, currency)}</span>
              <span>95. percentil {priceText(p95, currency)}</span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatTile
            label="Očekávaný výnos"
            value={signedPercentText(projection.expected_return_pct)}
            color={TONE_COLOR_ON_DARK[toneFor(projection.expected_return_pct)]}
            sub={arrowFor(projection.expected_return_pct) || undefined}
          />
          <StatTile
            label="Konec pod dnešní cenou"
            value={
              projection.probability_below_current_pct === null
                ? '—'
                : `${projection.probability_below_current_pct.toFixed(1).replace('.', ',')} %`
            }
            sub="podíl simulací"
          />
          <StatTile label="Medián" value={priceText(median, currency)} />
        </div>

        <div>
          <Row label="Denní drift" value={formatRate(projection.drift_daily)} />
          <Row label="Denní volatilita" value={formatRate(projection.volatility_daily)} />
          <Row
            label="Pozorování"
            value={`${projection.observations} dnů · seed ${projection.seed}`}
            hint="Pevný seed: stejný vstup dá vždy stejnou odpověď."
          />
        </div>

        <NoteBlock tone="gold">{projection.note}</NoteBlock>
      </div>
    </Panel>
  );
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(3).replace('.', ',')} %`;
}
