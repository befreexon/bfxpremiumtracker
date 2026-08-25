/**
 * Formatting helpers specific to this layer.
 *
 * Everything defers to `src/lib/format.ts` for the actual Czech number shapes;
 * these functions only decide *which* shape a given field deserves. The single
 * rule they all share: an absent value returns `MISSING`, never `0` and never a
 * silently substituted guess.
 */

import { MISSING, money, percent } from '../../lib/format';

const NBSP = ' ';

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function decimal(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** A price in the instrument's own currency. Currency may be unknown. */
export function priceText(
  value: number | null | undefined,
  currency: string | null,
  decimals = 2,
): string {
  if (!isNumber(value)) return MISSING;
  return currency ? money(value, currency, decimals) : money(value, '', decimals).trim();
}

/** Market cap and free cash flow, shortened so the column stays readable. */
export function bigMoneyText(value: number | null | undefined, currency: string | null): string {
  if (!isNumber(value)) return MISSING;
  const sign = value < 0 ? '−' : '';
  const size = Math.abs(value);
  const unit = currency ? `${NBSP}${currency}` : '';
  if (size >= 1e12) return `${sign}${decimal(size / 1e12, 2)}${NBSP}bil.${unit}`;
  if (size >= 1e9) return `${sign}${decimal(size / 1e9, 2)}${NBSP}mld.${unit}`;
  if (size >= 1e6) return `${sign}${decimal(size / 1e6, 2)}${NBSP}mil.${unit}`;
  return priceText(value, currency, 0);
}

/** A multiple: P/E, P/B, EV/EBITDA, current ratio. */
export function multipleText(value: number | null | undefined, decimals = 2): string {
  if (!isNumber(value)) return MISSING;
  return `${decimal(value, decimals)}×`;
}

/** A plain number with no unit at all. */
export function numberText(value: number | null | undefined, decimals = 2): string {
  if (!isNumber(value)) return MISSING;
  if (Math.abs(value) >= 1e6) return bigMoneyText(value, null);
  return decimal(value, decimals);
}

/** A percentage already expressed in percent, always with its sign. */
export function signedPercentText(value: number | null | undefined, decimals = 2): string {
  return percent(value, decimals, { withSign: true });
}

/** A fraction of one (0,24) rendered as a percentage (24,00 %). */
export function fractionAsPercentText(value: number | null | undefined, decimals = 2): string {
  if (!isNumber(value)) return MISSING;
  return percent(value * 100, decimals);
}

/**
 * yfinance is inconsistent about the dividend yield: older responses give
 * 0,0153 for 1,53 %, newer ones give 1,53. The backend normalises the same way
 * before scoring it, so the displayed number matches the scored one.
 */
export function normaliseDividendYield(raw: number): number {
  return raw <= 1 ? raw * 100 : raw;
}

/** Points inside a sub-score breakdown: two decimals, comma, no unit. */
export function pointsText(value: number): string {
  return decimal(value, 2);
}

/** A share of one shown as a whole-percent figure ("25 %"). */
export function weightText(value: number | null | undefined): string {
  if (!isNumber(value)) return MISSING;
  return `${Math.round(value * 100)}${NBSP}%`;
}

/** Trading days turned into the calendar span a reader thinks in. */
export function horizonText(days: number): string {
  const years = days / 252;
  if (years >= 0.98 && years <= 1.02) return 'přibližně 1 rok';
  if (years >= 1) return `přibližně ${decimal(years, 1)} roku`;
  const months = Math.round((days / 252) * 12);
  return `přibližně ${months} měsíců`;
}

/** Calendar days turned into a readable window ("2 roky"). */
export function lookbackText(days: number): string {
  if (days < 60) return `${days} dní`;
  if (days < 365) return `${Math.round(days / 30.4)} měsíců`;
  const years = days / 365;
  if (Math.abs(years - 1) < 0.06) return '1 rok';
  if (years < 5) return `${decimal(years, 1)} roku`;
  return `${Math.round(years)} let`;
}

/** The raw value of a score factor, formatted according to its declared unit. */
export function factorValueText(
  value: number | null,
  unit: string | null,
  currency: string | null,
): string {
  if (!isNumber(value)) return MISSING;
  if (unit === '%') return percent(value, 2);
  if (unit === 'x') return multipleText(value);
  if (unit && unit !== '') return `${decimal(value, 2)}${NBSP}${unit}`;
  if (Math.abs(value) >= 1e6) return bigMoneyText(value, currency);
  return decimal(value, 2);
}
