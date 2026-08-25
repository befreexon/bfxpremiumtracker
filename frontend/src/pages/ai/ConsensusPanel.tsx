import { TONE_COLOR_ON_DARK, arrowFor, toneFor } from '../../lib/format';
import { priceText, signedPercentText } from './formatting';
import { DARK, NoteBlock, Panel, ScaleBar, StatTile } from './primitives';
import type { AiConsensus } from './types';

export function ConsensusPanel({
  consensus,
  price,
  currency,
}: {
  consensus: AiConsensus;
  price: number | null;
  currency: string | null;
}) {
  const hasTargets =
    consensus.target_low !== null && consensus.target_high !== null && consensus.target_mean !== null;

  if (!consensus.recommendation_key && !hasTargets && consensus.analyst_count === null) {
    return (
      <Panel title="Konsenzus analytiků">
        <NoteBlock>
          Pro tento titul se nepodařilo získat žádné analytické pokrytí. Hodnocení výše s tím
          počítá — dílčí skóre pro konsenzus vypadlo a nesnížilo celkové skóre.
        </NoteBlock>
      </Panel>
    );
  }

  const scaleValues = [consensus.target_low, consensus.target_high, price].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );

  return (
    <Panel
      title="Konsenzus analytiků"
      subtitle={
        consensus.analyst_count !== null ? `${consensus.analyst_count} analytiků` : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatTile
            label="Doporučení"
            value={consensus.recommendation_cs ?? consensus.recommendation_key ?? '—'}
            sub="jak titul vidí sell-side"
          />
          <StatTile label="Cílová cena (průměr)" value={priceText(consensus.target_mean, currency)} />
          <StatTile
            label="Prostor k cíli"
            value={signedPercentText(consensus.implied_upside_pct)}
            color={TONE_COLOR_ON_DARK[toneFor(consensus.implied_upside_pct)]}
            sub={arrowFor(consensus.implied_upside_pct) || undefined}
          />
        </div>

        {hasTargets && scaleValues.length > 0 && (
          <div>
            <ScaleBar
              min={Math.min(...scaleValues)}
              max={Math.max(...scaleValues)}
              bands={[{ from: consensus.target_low!, to: consensus.target_high!, color: 'rgba(220,180,92,0.18)' }]}
              markers={[
                ...(price !== null
                  ? [{ value: price, color: DARK.faint, caption: `dnes ${priceText(price, currency)}` }]
                  : []),
                {
                  value: consensus.target_mean!,
                  color: DARK.gold,
                  caption: `cíl ${priceText(consensus.target_mean, currency)}`,
                },
              ]}
              height={12}
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
              <span>nejnižší {priceText(consensus.target_low, currency)}</span>
              <span>nejvyšší {priceText(consensus.target_high, currency)}</span>
            </div>
          </div>
        )}

        <NoteBlock>
          Cílové ceny jsou názory analytiků, ne měření. Rozpětí mezi nejnižším a nejvyšším cílem
          říká, jak moc se mezi sebou neshodnou.
        </NoteBlock>
      </div>
    </Panel>
  );
}
