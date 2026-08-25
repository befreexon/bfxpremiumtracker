/**
 * Czech number formatting.
 *
 * Amounts are grouped with a narrow no-break space (1 284 903 Kč) and always
 * rendered right-aligned in `tabular-nums`. That last part is a requirement
 * rather than a preference: without fixed-width digits the columns of a money
 * table drift and stop being comparable at a glance.
 */

export const NUMERIC_STYLE = {
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
} as const;

const NBSP = ' ';

function group(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Returns null-safe placeholder text for anything the app could not compute. */
export const MISSING = '—';

export function czk(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  const rounded = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = rounded.split('.');
  const body = fraction ? `${group(whole)},${fraction}` : group(whole);
  return `${value < 0 ? '−' : ''}${body}${NBSP}Kč`;
}

/** Balances are never rounded away — two decimals, always. */
export function money(value: number | null | undefined, currency: string, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  const rounded = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = rounded.split('.');
  const body = `${group(whole)},${fraction}`;
  return `${value < 0 ? '−' : ''}${body}${NBSP}${currency}`;
}

export function percent(
  value: number | null | undefined,
  decimals = 2,
  { withSign = false }: { withSign?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  const sign = withSign && value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(decimals).replace('.', ',')}${NBSP}%`;
}

/** A share of one, rendered as a percentage. */
export function share(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return MISSING;
  return percent(value * 100, decimals);
}

export function quantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING;
  // Crypto needs eight decimals; whole shares should not show any.
  const decimals = Number.isInteger(value) ? 0 : Math.min(8, 8);
  return group(value.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''))
    .replace('.', ',');
}

export function date(value: string | null | undefined): string {
  if (!value) return MISSING;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return MISSING;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Colour for a gain or loss. Never the only carrier of the information — the
 * sign travels with it — but it makes a long column scannable.
 */
export function toneFor(value: number | null | undefined): 'gain' | 'loss' | 'flat' {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'flat';
  if (value > 0) return 'gain';
  if (value < 0) return 'loss';
  return 'flat';
}

export const TONE_COLOR: Record<'gain' | 'loss' | 'flat', string> = {
  gain: 'var(--gain)',
  loss: 'var(--loss)',
  flat: 'var(--mute)',
};

export const TONE_COLOR_ON_DARK: Record<'gain' | 'loss' | 'flat', string> = {
  gain: 'var(--gain-on-dark)',
  loss: 'var(--loss-on-dark)',
  flat: 'var(--on-dark-mute)',
};

/** An arrow so the direction survives for anyone who cannot see the colour. */
export function arrowFor(value: number | null | undefined): string {
  const tone = toneFor(value);
  if (tone === 'gain') return '▲';
  if (tone === 'loss') return '▼';
  return '';
}

export function daysLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return MISSING;
  if (days <= 0) return 'splněno';
  if (days < 31) return `${days} dní`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `${months} měs.`;
  return `${(days / 365).toFixed(1).replace('.', ',')} roku`;
}
