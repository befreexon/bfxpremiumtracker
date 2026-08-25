/**
 * Local narrowing of the AI analysis payload.
 *
 * `src/api/types.ts` types `quote`, `fundamentals` and `consensus` as loose
 * records because they are only ever passed through. This layer renders every
 * field by name, so it needs the real shape — which is the one declared by the
 * dataclasses in `backend/app/services/ai_analysis.py`. The interfaces below
 * mirror those dataclasses field for field; nothing here invents a field the
 * backend does not send, and every optional value stays `null` rather than
 * defaulting to zero.
 *
 * `src/api/types.ts` itself is left untouched — the narrowing lives here.
 */

import type { Assessment, Projection, Technicals, TickerAnalysis } from '../../api/types';

export interface AiQuote {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  previous_close: number | null;
  day_change_pct: number | null;
  week52_high: number | null;
  week52_low: number | null;
  /** 0 = at the 52-week low, 1 = at the 52-week high. */
  position_in_52w_range: number | null;
}

export interface AiFundamentals {
  market_cap: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  peg: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  ev_to_ebitda: number | null;
  ev_to_fcf: number | null;
  /** Fraction, not percent: 0.24 means 24 %. */
  profit_margin: number | null;
  roe: number | null;
  roa: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  /** yfinance reports this already as a percentage: 150 means 1,5× equity. */
  debt_to_equity: number | null;
  current_ratio: number | null;
  free_cash_flow: number | null;
  /** Already a percentage, unlike free_cash_flow itself. */
  fcf_yield: number | null;
  /** Already a percentage — the inverse framing of trailing_pe. */
  earnings_yield: number | null;
  /** Either a fraction or a percentage — normalised on display, as the backend does. */
  dividend_yield: number | null;
  payout_ratio: number | null;
  beta: number | null;
}

export interface AiConsensus {
  recommendation_key: string | null;
  recommendation_cs: string | null;
  analyst_count: number | null;
  target_mean: number | null;
  target_high: number | null;
  target_low: number | null;
  implied_upside_pct: number | null;
}

export interface AiNarrative {
  text: string | null;
  model: string | null;
  generated: boolean;
  note: string;
}

export interface AiAnalysis {
  ticker: string;
  resolved_symbol: string;
  generated_at: string;
  lookback_days: number;
  horizon_days: number;
  quote: AiQuote;
  fundamentals: AiFundamentals;
  technicals: Technicals;
  projection: Projection | null;
  consensus: AiConsensus;
  assessment: Assessment;
  narrative: AiNarrative | null;
  missing_data: string[];
  disclaimer: string;
}

/** The API response, read at the precision this layer renders it. */
export function narrowAnalysis(payload: TickerAnalysis): AiAnalysis {
  return payload as unknown as AiAnalysis;
}

export interface AnalyzeRequest {
  ticker: string;
  exchange: string;
  horizonDays: number;
  lookbackDays: number;
  includeNarrative: boolean;
}
