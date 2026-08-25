/**
 * Where the number came from.
 *
 * The backend rescales each sub-score so that its visible factor points add up
 * to the sub-score itself. That property is the whole point of this section, so
 * the sum is printed under every expanded list and the composite is spelled out
 * as the arithmetic that produced it. Nothing here is a black box: a factor
 * shows the raw value it was measured from, the points it contributed, its
 * maximum, and the Czech sentence explaining the mapping.
 */

import { useState } from 'react';
import { MISSING, share } from '../../lib/format';
import { factorValueText, pointsText, weightText } from './formatting';
import { DARK, Eyebrow, Meter, NoteBlock, Panel, ScrollArea } from './primitives';
import type { Assessment, SubScore } from '../../api/types';

function Factor({ factor, currency }: { factor: SubScore['factors'][number]; currency: string | null }) {
  const fill = factor.max_points > 0 ? factor.points / factor.max_points : 0;
  return (
    <div style={{ padding: '14px 0', borderTop: `1px solid ${DARK.divider}` }}>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: DARK.text }}>{factor.label}</div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, color: DARK.mute, fontVariantNumeric: 'tabular-nums' }}>
            {factorValueText(factor.value, factor.unit, currency)}
          </span>
          <span
            style={{
              fontSize: 14,
              color: DARK.text,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 108,
              textAlign: 'right',
            }}
          >
            {pointsText(factor.points)}
            <span style={{ color: DARK.faint }}> / {pointsText(factor.max_points)} b.</span>
          </span>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <Meter value={fill * 100} color={fill >= 0.66 ? DARK.gold : fill >= 0.33 ? 'var(--gold-deep)' : 'rgba(255,255,255,0.30)'} height={4} />
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: DARK.mute, maxWidth: '76ch' }}>
        {factor.explanation}
      </p>
    </div>
  );
}

function SubScoreBlock({
  sub,
  currency,
  open,
  onToggle,
}: {
  sub: SubScore;
  currency: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const available = sub.score !== null;
  const factorSum = sub.factors.reduce((total, factor) => total + factor.points, 0);
  const maxSum = sub.factors.reduce((total, factor) => total + factor.max_points, 0);

  return (
    <div
      style={{
        border: `1px solid ${DARK.hairline}`,
        borderRadius: 'var(--radius-md)',
        background: DARK.raised,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        disabled={!available}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '16px 18px',
          cursor: available ? 'pointer' : 'default',
          color: DARK.text,
          fontFamily: 'var(--font-body)',
          textAlign: 'left',
          display: 'block',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            {available && <span style={{ color: DARK.faint, marginRight: 8 }}>{open ? '−' : '+'}</span>}
            {sub.label}
          </span>
          <span style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: available ? DARK.gold : DARK.faint }}>
            {available ? pointsText(sub.score as number) : MISSING}
            <span style={{ fontSize: 13, color: DARK.faint }}> / 100</span>
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <Meter value={sub.score} color={available ? DARK.gold : 'rgba(255,255,255,0.18)'} />
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: DARK.faint }}>
          <span>váha v souhrnu {weightText(sub.weight)}</span>
          <span>pokrytí dat {share(sub.coverage, 0)}</span>
          <span>{sub.factors.length} faktorů</span>
        </div>
      </button>

      {!available && (
        <div style={{ padding: '0 18px 16px' }}>
          <NoteBlock>
            {sub.unavailable_reason ?? 'Tuto část hodnocení se nepodařilo spočítat.'} Do souhrnného
            skóre proto nevstupuje vůbec — nepočítá se jako nula.
          </NoteBlock>
        </div>
      )}

      {available && open && (
        <div style={{ padding: '0 18px 18px' }}>
          {sub.factors.map((factor) => (
            <Factor key={factor.key} factor={factor} currency={currency} />
          ))}
          <div
            style={{
              marginTop: 14,
              borderTop: `1px solid ${DARK.hairline}`,
              paddingTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              fontSize: 13,
              color: DARK.mute,
            }}
          >
            <span>Součet bodů všech faktorů</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: DARK.text }}>
              {pointsText(factorSum)} z {pointsText(maxSum)} možných = dílčí skóre{' '}
              {pointsText(sub.score as number)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The composite, written out as the arithmetic the backend performed. */
function CompositeLine({ assessment }: { assessment: Assessment }) {
  const scored = assessment.subscores.filter((sub) => sub.score !== null);
  if (scored.length === 0 || assessment.score === null) return null;

  const weightSum = scored.reduce((total, sub) => total + sub.weight, 0);
  const terms = scored
    .map((sub) => `${weightText(sub.weight)} × ${pointsText(sub.score as number)}`)
    .join('  +  ');
  const dropped = assessment.subscores.filter((sub) => sub.score === null);

  return (
    <div
      style={{
        marginTop: 18,
        border: `1px solid ${DARK.hairline}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 18px',
        background: DARK.raised,
      }}
    >
      <Eyebrow>Jak vznikl souhrn</Eyebrow>
      <ScrollArea minWidth={420}>
        <div style={{ marginTop: 8, fontSize: 14, color: DARK.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          ({terms}) ÷ {weightText(weightSum)} = {pointsText(assessment.score)}
        </div>
      </ScrollArea>
      {dropped.length > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: DARK.mute }}>
          Nespočítané části ({dropped.map((sub) => sub.label.toLowerCase()).join(', ')}) se ze vzorce
          vypustily a váhy zbylých se přepočítaly. Chybějící data se tedy nepromítají jako nula, ale
          snižují spolehlivost.
        </p>
      )}
    </div>
  );
}

export function ScoreBreakdown({
  assessment,
  currency,
}: {
  assessment: Assessment;
  currency: string | null;
}) {
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const expandable = assessment.subscores.filter((sub) => sub.score !== null);
  const allOpen = expandable.length > 0 && expandable.every((sub) => openKeys.includes(sub.key));

  return (
    <Panel
      title="Z čeho se skóre skládá"
      subtitle="Čtyři dílčí skóre, každé 0–100 a každé rozepsané na faktory. Body faktorů se sečtou přesně na dílčí skóre — nic se cestou neztrácí."
      right={
        expandable.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpenKeys(allOpen ? [] : expandable.map((sub) => sub.key))}
            style={{
              background: 'transparent',
              border: `1px solid ${DARK.hairline}`,
              borderRadius: 'var(--radius-full)',
              color: DARK.mute,
              padding: '6px 14px',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              cursor: 'pointer',
            }}
          >
            {allOpen ? 'Sbalit vše' : 'Rozbalit vše'}
          </button>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {assessment.subscores.map((sub) => (
          <SubScoreBlock
            key={sub.key}
            sub={sub}
            currency={currency}
            open={openKeys.includes(sub.key)}
            onToggle={() =>
              setOpenKeys((keys) =>
                keys.includes(sub.key) ? keys.filter((key) => key !== sub.key) : [...keys, sub.key],
              )
            }
          />
        ))}
      </div>
      <CompositeLine assessment={assessment} />
    </Panel>
  );
}
