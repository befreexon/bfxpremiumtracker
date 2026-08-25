/**
 * The one decorative element in the interface.
 *
 * A thin bar spanning the holding period, from the day a lot was bought to the
 * day it becomes exempt, with a mark for every lot. The point is a single
 * glance: which tranches are already through the time test and how far the rest
 * still have to go. Colour carries the urgency, but the count and the countdown
 * underneath carry the same information in words.
 */

import type { Lot, TaxTestStatus } from '../../api/types';
import { daysLabel, date as formatDate, quantity as formatQuantity, MISSING } from '../../lib/format';
import { CAPTION, EYEBROW, TAX_COLOR, TAX_LABEL } from './theme';

const DAYS_PER_YEAR = 365.25;
const LANE_HEIGHT = 15;
/** Marks closer together than this share of the bar get their own lane. */
const MIN_GAP_PCT = 4;

interface Placed {
  lot: Lot;
  x: number;
  lane: number;
}

function place(lots: Lot[], years: number): { placed: Placed[]; lanes: number } {
  const span = Math.max(years, 1) * DAYS_PER_YEAR;
  const positioned = lots
    .filter((lot) => lot.tax_test_days_remaining !== null)
    .map((lot) => {
      const remaining = lot.tax_test_days_remaining as number;
      const raw = 1 - remaining / span;
      return { lot, x: Math.min(100, Math.max(0, raw * 100)) };
    })
    .sort((a, b) => a.x - b.x);

  const laneLastX: number[] = [];
  const placed: Placed[] = positioned.map((item) => {
    let lane = laneLastX.findIndex((last) => item.x - last >= MIN_GAP_PCT);
    if (lane === -1) {
      laneLastX.push(item.x);
      lane = laneLastX.length - 1;
    } else {
      laneLastX[lane] = item.x;
    }
    return { ...item, lane };
  });

  return { placed, lanes: Math.max(laneLastX.length, 1) };
}

function summarise(lots: Lot[]): string {
  if (lots.length === 0) return 'Žádné otevřené tranše.';
  const passed = lots.filter((lot) => lot.tax_test_status === 'passed').length;
  const pending = lots.filter(
    (lot) => lot.tax_test_status !== 'passed' && lot.tax_test_days_remaining !== null,
  );
  const nearest = pending.reduce<number | null>((best, lot) => {
    const days = lot.tax_test_days_remaining as number;
    return best === null || days < best ? days : best;
  }, null);

  const head =
    passed === lots.length
      ? allPassedSentence(lots.length)
      : `${passed} z ${lots.length} ${trancheGenitive(lots.length)} je osvobozeno.`;
  if (nearest === null) return head;
  return `${head} Nejbližší další za ${daysLabel(nearest)}.`;
}

/**
 * Czech counts three ways — one tranche, two to four tranches, five tranches —
 * and getting it wrong reads as a machine talking in an interface otherwise
 * written by a person.
 */
function trancheGenitive(count: number): string {
  return count === 1 ? 'tranše' : 'tranší';
}

function allPassedSentence(count: number): string {
  if (count === 1) return 'Jediná tranše je osvobozená.';
  if (count < 5) return `Všechny ${count} tranše jsou osvobozené.`;
  return `Všech ${count} tranší je osvobozeno.`;
}

export function TaxTimeline({
  lots,
  years,
  currency,
}: {
  lots: Lot[];
  years: number;
  currency: string;
}) {
  const { placed, lanes } = place(lots, years);
  const unknown = lots.filter((lot) => lot.tax_test_days_remaining === null);
  const present: TaxTestStatus[] = (['passed', 'soon', 'approaching', 'far'] as TaxTestStatus[]).filter(
    (status) => lots.some((lot) => lot.tax_test_status === status),
  );

  const ticks = Array.from({ length: Math.max(years, 1) + 1 }, (_, index) => index);

  return (
    <div>
      <div style={EYEBROW}>Časový test</div>
      <div style={{ ...CAPTION, marginTop: 6 }}>
        Osvobození od daně z příjmu po {years} letech držby. Každá tranše má vlastní odpočet.
      </div>

      <div style={{ marginTop: 18, padding: '0 10px' }}>
        <div style={{ position: 'relative', height: 8 + lanes * LANE_HEIGHT }}>
          {/* The track: the whole holding period, left to right. */}
          <div
            style={{
              position: 'absolute',
              inset: '0 0 auto 0',
              height: 8,
              borderRadius: 'var(--radius-full)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--hairline-dark)',
              overflow: 'hidden',
            }}
          >
            {ticks.slice(1, -1).map((tick) => (
              <span
                key={tick}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${(tick / Math.max(years, 1)) * 100}%`,
                  width: 1,
                  background: 'var(--hairline-dark)',
                }}
              />
            ))}
          </div>

          {/* The finish line: everything that reaches it is exempt. */}
          <div
            style={{
              position: 'absolute',
              top: -4,
              left: '100%',
              width: 2,
              height: 16,
              background: 'var(--tax-passed)',
              transform: 'translateX(-1px)',
            }}
            aria-hidden="true"
          />

          {placed.map((item, index) => (
            <span
              key={`${item.lot.transaction_id ?? 'lot'}-${index}`}
              title={`${formatDate(item.lot.date)} · ${formatQuantity(item.lot.quantity)} ks · ${
                TAX_LABEL[item.lot.tax_test_status]
              } (${daysLabel(item.lot.tax_test_days_remaining)})`}
              style={{
                position: 'absolute',
                left: `${item.x}%`,
                top: 12 + item.lane * LANE_HEIGHT,
                width: 11,
                height: 11,
                marginLeft: -5.5,
                borderRadius:
                  item.lot.tax_test_status === 'passed' ? 'var(--radius-full)' : 'var(--radius-sm)',
                background: TAX_COLOR[item.lot.tax_test_status],
                border: '1px solid var(--surface-deep)',
              }}
            />
          ))}
        </div>

        <div
          style={{
            position: 'relative',
            height: 16,
            marginTop: 4,
            fontSize: 11,
            color: 'var(--on-dark-mute)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              style={{
                position: 'absolute',
                left: `${(tick / Math.max(years, 1)) * 100}%`,
                transform:
                  tick === 0 ? 'none' : tick === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              {tick === ticks.length - 1 ? 'osvobozeno' : `${tick} r.`}
            </span>
          ))}
        </div>
      </div>

      <div style={{ ...CAPTION, marginTop: 14, color: 'var(--on-dark)', fontSize: 14 }}>
        {summarise(lots)}
      </div>

      {unknown.length > 0 && (
        <div style={{ ...CAPTION, marginTop: 6 }}>
          {unknown.length}× nejde odpočet spočítat — u tranše chybí datum nebo kurz. Doplň kurz v
          transakci.
        </div>
      )}

      {present.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
          {present.map((status) => {
            const count = lots.filter((lot) => lot.tax_test_status === status).length;
            return (
              <span
                key={status}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--on-dark-mute)' }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: status === 'passed' ? 'var(--radius-full)' : 2,
                    background: TAX_COLOR[status],
                    display: 'inline-block',
                  }}
                />
                {TAX_LABEL[status]} · {count}×
              </span>
            );
          })}
          <span style={{ fontSize: 12, color: 'var(--on-dark-mute)' }}>
            Měna tranší: {currency || MISSING}
          </span>
        </div>
      )}
    </div>
  );
}
