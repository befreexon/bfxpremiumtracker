/**
 * The composite score and what it is worth.
 *
 * The confidence is not a footnote here. A verdict computed from a quarter of
 * the intended inputs is arithmetic, not an assessment, so when confidence is
 * low the warning is the first thing in the card and the score is visibly
 * demoted — never a confident-looking headline over thin data.
 */

import { MISSING, share } from '../../lib/format';
import { pointsText } from './formatting';
import { Chip, DARK, Eyebrow, Meter, NoteBlock, Panel } from './primitives';
import type { Assessment } from '../../api/types';

/** The bands `verdict_for_score` in the backend uses, shown on the scale. */
const BANDS = [
  { from: 0, label: 'Slabé' },
  { from: 30, label: 'Spíše rizikové' },
  { from: 45, label: 'Neutrální' },
  { from: 60, label: 'Spíše příznivé' },
  { from: 75, label: 'Silné fundamenty' },
];

type ConfidenceLevel = 'high' | 'medium' | 'low';

function levelFor(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
}

const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = {
  high: 'var(--gold)',
  medium: 'var(--accent-warning)',
  low: '#e3897f',
};

export function VerdictCard({ assessment }: { assessment: Assessment }) {
  const level = levelFor(assessment.confidence);
  const confidenceColor = CONFIDENCE_COLOR[level];
  const scoreKnown = assessment.score !== null;

  return (
    <Panel
      title="Souhrnné hodnocení"
      subtitle="Vážený průměr čtyř dílčích skóre níže. Popisuje, jak vycházejí čísla — neříká, co s titulem dělat."
    >
      {level === 'low' && (
        <div style={{ marginBottom: 20 }}>
          <NoteBlock tone="warning">
            <strong style={{ color: DARK.text, display: 'block', marginBottom: 4 }}>
              Hodnocení stojí na tenkých datech — spolehlivost {share(assessment.confidence, 0)}.
            </strong>
            Podařilo se získat jen část vstupů, se kterými skóre počítá. Ber souhrnné číslo jako
            orientační a čti dílčí skóre a chybějící vstupy níže.
          </NoteBlock>
        </div>
      )}

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 auto', minWidth: 180 }}>
          <Eyebrow>Skóre</Eyebrow>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 64,
              lineHeight: 1.02,
              letterSpacing: '-1.4px',
              fontVariantNumeric: 'tabular-nums',
              color: scoreKnown ? (level === 'low' ? DARK.mute : DARK.gold) : DARK.mute,
              marginTop: 6,
            }}
          >
            {scoreKnown ? pointsText(assessment.score as number) : MISSING}
            <span style={{ fontSize: 20, color: DARK.faint, letterSpacing: 0 }}> / 100</span>
          </div>
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 260 }}>
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-heading-md-size)',
              fontWeight: 600,
              color: DARK.text,
            }}
          >
            {assessment.verdict}
          </h3>
          <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.6, color: DARK.mute, maxWidth: '62ch' }}>
            {assessment.verdict_detail}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <Meter value={assessment.score} color={level === 'low' ? 'rgba(255,255,255,0.35)' : DARK.gold} height={8} />
        <div style={{ position: 'relative', height: 18, marginTop: 6 }}>
          {BANDS.map((band) => (
            <span
              key={band.label}
              style={{
                position: 'absolute',
                left: `${band.from}%`,
                fontSize: 11,
                color: DARK.faint,
                whiteSpace: 'nowrap',
                transform: band.from > 70 ? 'translateX(-40%)' : 'none',
              }}
            >
              {band.from} {band.label}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 26,
          border: `1px solid ${DARK.hairline}`,
          borderRadius: 'var(--radius-md)',
          padding: '16px 18px',
          background: DARK.raised,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <Eyebrow>Spolehlivost analýzy</Eyebrow>
          <span style={{ fontSize: 16, fontWeight: 600, color: confidenceColor, fontVariantNumeric: 'tabular-nums' }}>
            {assessment.confidence_label} · {share(assessment.confidence, 0)}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <Meter value={assessment.confidence * 100} color={confidenceColor} />
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: DARK.mute, maxWidth: '70ch' }}>
          Spolehlivost je podíl očekávaných vstupů, které se skutečně podařilo načíst, vážený podle
          váhy jednotlivých částí. Je to údaj o datech, ne o firmě — a rozhodně ne pravděpodobnost,
          že cena poroste.
        </p>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <Eyebrow>Chybějící vstupy</Eyebrow>
          <span style={{ fontSize: 13, color: DARK.faint }}>
            {assessment.missing_inputs.length === 0
              ? 'žádné'
              : `${assessment.missing_inputs.length} položek se nepodařilo získat`}
          </span>
        </div>
        {assessment.missing_inputs.length === 0 ? (
          <div style={{ fontSize: 14, color: DARK.mute }}>
            Všechny vstupy, se kterými hodnocení počítá, se podařilo načíst.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {assessment.missing_inputs.map((item, index) => (
              <Chip key={`${item}-${index}`}>{item}</Chip>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
