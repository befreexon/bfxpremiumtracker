/**
 * Identity and price. Everything a reader needs to be sure the analysis below
 * is about the company they meant, plus where today's price sits in the year.
 */

import { MISSING, TONE_COLOR_ON_DARK, arrowFor, dateTime, toneFor } from '../../lib/format';
import { horizonText, lookbackText, priceText, signedPercentText } from './formatting';
import { Chip, DARK, Eyebrow, Panel, ScaleBar } from './primitives';
import type { AiAnalysis } from './types';

export function AnalysisHeader({ analysis }: { analysis: AiAnalysis }) {
  const { quote } = analysis;
  const tone = toneFor(quote.day_change_pct);
  const changeColor = TONE_COLOR_ON_DARK[tone];
  const arrow = arrowFor(quote.day_change_pct);

  const low = quote.week52_low;
  const high = quote.week52_high;
  const price = quote.price;
  const hasRange = low !== null && high !== null && price !== null && high > low;

  const identity = [quote.sector, quote.industry].filter(Boolean).join(' · ');

  return (
    <Panel>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 240, flex: '1 1 320px' }}>
          <Eyebrow>
            {analysis.resolved_symbol}
            {quote.exchange ? ` · ${quote.exchange}` : ''}
          </Eyebrow>
          <h1
            style={{
              margin: '8px 0 6px',
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-heading-lg-size)',
              lineHeight: 'var(--text-heading-lg-lh)',
              letterSpacing: 'var(--text-heading-lg-ls)',
              fontWeight: 600,
              color: DARK.text,
            }}
          >
            {quote.name ?? analysis.ticker}
          </h1>
          <div style={{ fontSize: 14, color: DARK.mute }}>
            {identity || 'Sektor a odvětví se nepodařilo načíst'}
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 180 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 34,
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
              color: DARK.text,
            }}
          >
            {priceText(price, quote.currency)}
          </div>
          <div style={{ fontSize: 15, color: changeColor, fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>
            {quote.day_change_pct === null
              ? `${MISSING} za den`
              : `${arrow} ${signedPercentText(quote.day_change_pct)} za den`}
          </div>
          <div style={{ fontSize: 12, color: DARK.faint, marginTop: 4 }}>
            předchozí zavírací {priceText(quote.previous_close, quote.currency)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, borderTop: `1px solid ${DARK.divider}`, paddingTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <Eyebrow>Pozice v 52týdenním rozpětí</Eyebrow>
          {quote.position_in_52w_range !== null && (
            <span style={{ fontSize: 13, color: DARK.mute, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(quote.position_in_52w_range * 100)} % cesty od minima k maximu
            </span>
          )}
        </div>

        {hasRange ? (
          <>
            <ScaleBar
              min={low}
              max={high}
              bands={[{ from: low, to: price, color: 'rgba(220,180,92,0.30)' }]}
              markers={[{ value: price, color: DARK.gold, caption: priceText(price, quote.currency) }]}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: DARK.faint, marginTop: 4 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>min {priceText(low, quote.currency)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>max {priceText(high, quote.currency)}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: DARK.mute }}>
            52týdenní minimum ani maximum se nepodařilo načíst, rozpětí proto nelze zobrazit.
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Chip>měna {quote.currency ?? MISSING}</Chip>
        <Chip>historie {lookbackText(analysis.lookback_days)}</Chip>
        <Chip>
          {analysis.technicals.observations} obchodních dní v okně
        </Chip>
        <Chip>horizont projekce {horizonText(analysis.horizon_days)}</Chip>
        <Chip>spočteno {dateTime(analysis.generated_at)}</Chip>
      </div>
    </Panel>
  );
}
