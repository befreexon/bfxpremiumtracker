/**
 * Shared surface styles for the portfolio layer.
 *
 * The layer sits on the dark canvas, so everything here assumes light text on
 * `--canvas-dark`. Panels are hairline-bordered rather than shadowed: a money
 * table gains nothing from depth and loses crispness to it.
 */

import type { CSSProperties } from 'react';
import type { AssetClass, TaxTestStatus, TransactionType } from '../../api/types';

export const PANEL: CSSProperties = {
  background: 'var(--surface-deep)',
  border: '1px solid var(--hairline-dark)',
  borderRadius: 'var(--radius-lg)',
  padding: 20,
};

export const PANEL_INSET: CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--hairline-dark)',
  borderRadius: 'var(--radius-md)',
  padding: 16,
};

/** Small all-caps label above a block of numbers. */
export const EYEBROW: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'var(--on-dark-mute)',
};

export const SECTION_TITLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--on-dark)',
  margin: 0,
};

export const CAPTION: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--on-dark-mute)',
};

export const TABLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
};

export const TH: CSSProperties = {
  ...EYEBROW,
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid var(--hairline-dark)',
  whiteSpace: 'nowrap',
};

export const TH_NUM: CSSProperties = { ...TH, textAlign: 'right' };

export const TD: CSSProperties = {
  padding: '11px 12px',
  borderBottom: '1px solid var(--divider-soft)',
  color: 'var(--on-dark)',
  verticalAlign: 'middle',
};

export const TD_NUM: CSSProperties = {
  ...TD,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

export const TAX_COLOR: Record<TaxTestStatus, string> = {
  far: 'var(--tax-far)',
  approaching: 'var(--tax-approaching)',
  soon: 'var(--tax-soon)',
  passed: 'var(--tax-passed)',
  unknown: 'var(--stone)',
};

/** Wording for the holding-period test, in the order the money moves through it. */
export const TAX_LABEL: Record<TaxTestStatus, string> = {
  far: 'Daleko',
  approaching: 'Blíží se',
  soon: 'Brzy',
  passed: 'Splněno',
  unknown: 'Neznámé',
};

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  STOCK: 'Akcie',
  ETF: 'ETF',
  CRYPTO: 'Krypto',
};

export const TYPE_LABEL: Record<TransactionType, string> = {
  BUY: 'Nákup',
  SELL: 'Prodej',
  DIV: 'Dividenda',
  ADJUST: 'Split / úprava',
};

/** The key the API uses to address one instrument. Mirrors PositionView.instrument_key. */
export function instrumentKey(item: { ticker: string; exchange: string; currency: string }): string {
  return `${item.ticker}|${item.exchange}|${item.currency}`;
}

/**
 * Turns anything thrown by the client into a sentence a person can act on.
 * Never an apology — what happened, and what to do about it.
 */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** A percentage the backend already scaled to 0–100. */
export const PCT_DECIMALS = 2;
