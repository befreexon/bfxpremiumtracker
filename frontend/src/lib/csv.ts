import Papa from 'papaparse';

export interface ParsedHolding {
  ticker: string;
  weight: number;
}

export interface ParseResult {
  rows: ParsedHolding[];
  error?: string;
}

const TICKER_KEYS = ['ticker', 'symbol'];
const WEIGHT_KEYS = ['weight', 'allocation', 'percentage', 'pct', '%'];

/**
 * Parses a portfolio CSV with a "ticker"/"symbol" column and a
 * "weight"/"allocation"/"percentage"/"pct" column. Weights may be given as
 * fractions (0.4) or percentages (40 or 40%) — detected from the column sum.
 */
export function parsePortfolioCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length) {
    return { rows: [], error: parsed.errors[0].message };
  }

  const fields = parsed.meta.fields ?? [];
  const tickerKey = fields.find((f) => TICKER_KEYS.includes(f));
  const weightKey = fields.find((f) => WEIGHT_KEYS.includes(f));

  if (!tickerKey || !weightKey) {
    return {
      rows: [],
      error: `CSV must have a "ticker" and "weight" column. Found: ${fields.join(', ') || '(none)'}`,
    };
  }

  const rows: ParsedHolding[] = [];
  for (const record of parsed.data) {
    const ticker = (record[tickerKey] ?? '').trim().toUpperCase();
    if (!ticker) continue;

    const rawWeight = (record[weightKey] ?? '').replace('%', '').trim();
    const weight = parseFloat(rawWeight);
    if (Number.isNaN(weight)) {
      return { rows: [], error: `Invalid weight for ${ticker}: "${record[weightKey]}"` };
    }
    rows.push({ ticker, weight });
  }

  if (rows.length === 0) {
    return { rows: [], error: 'No holdings found in the file.' };
  }

  const sum = rows.reduce((total, r) => total + r.weight, 0);
  const normalized = sum > 1.5 ? rows.map((r) => ({ ...r, weight: r.weight / 100 })) : rows;

  return { rows: normalized };
}
