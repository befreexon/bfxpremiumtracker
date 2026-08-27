/** Shapes returned by the API. Mirrors the backend dataclasses. */

export type TransactionType = 'BUY' | 'SELL' | 'DIV' | 'ADJUST';
export type AssetClass = 'STOCK' | 'ETF' | 'CRYPTO';
export type TaxTestStatus = 'passed' | 'soon' | 'approaching' | 'far' | 'unknown';

export interface User {
  id: number;
  email: string;
  display_name: string;
  tax_test_years: number;
  tax_exempt_cap_czk: number;
  benchmark_ticker: string;
}

export interface Portfolio {
  id: number;
  name: string;
  note: string;
  created_at: string;
  transaction_count: number;
}

export interface Transaction {
  id: number;
  portfolio_id: number;
  portfolio_name: string;
  type: TransactionType;
  date: string;
  ticker: string;
  exchange: string;
  asset_class: AssetClass;
  quantity: number;
  price: number;
  currency: string;
  fee: number;
  fx_rate: number | null;
  isin: string;
  name: string;
  note: string;
}

export interface Lot {
  quantity: number;
  price: number;
  fx_rate: number | null;
  date: string;
  cost_czk: number | null;
  value_czk: number | null;
  gain_czk: number | null;
  gain_pct: number | null;
  tax_test_days_remaining: number | null;
  tax_test_status: TaxTestStatus;
  split_ratio: number;
  transaction_id: number | null;
}

export interface Sale {
  date: string;
  quantity: number;
  lot_date: string;
  proceeds_czk: number;
  cost_czk: number;
  gain_czk: number;
  held_days: number;
  tax_test_passed: boolean;
}

export interface Dividend {
  date: string;
  gross_czk: number;
  tax_czk: number;
  net_czk: number;
}

export interface Split {
  date: string;
  ratio: number;
}

export interface Position {
  ticker: string;
  exchange: string;
  currency: string;
  asset_class: AssetClass;
  name: string;
  quantity: number;
  average_price: number | null;
  current_price: number | null;
  price_is_manual: boolean;
  price_as_of: string | null;
  fx_rate: number | null;
  cost_czk: number;
  total_buy_cost_czk: number;
  value_czk: number | null;
  unrealized_gain_czk: number | null;
  realized_gain_czk: number;
  gross_dividends_czk: number;
  net_dividends_czk: number;
  total_gain_czk: number | null;
  total_gain_pct: number | null;
  price_move_pct: number | null;
  price_effect_czk: number | null;
  fx_effect_czk: number | null;
  weight: number | null;
  xirr: number | null;
  lots: Lot[];
  sales: Sale[];
  dividends: Dividend[];
  splits: Split[];
  missing_price: boolean;
  missing_fx: boolean;
  warnings: string[];
}

export interface AllocationSlice {
  label: string;
  value_czk: number;
  weight: number;
  color: string | null;
}

export interface Segment {
  id: number;
  name: string;
  color: string;
  member_instrument_keys: string[];
}

export interface ConcentrationWarning {
  instrument_key: string;
  ticker: string;
  weight: number;
  message: string;
}

export interface UpcomingDividend {
  instrument_key: string;
  ticker: string;
  expected_date: string;
  days_away: number;
  estimated_net_czk: number | null;
  based_on_payments: number;
  cadence_days: number;
}

export interface DividendGrowth {
  ticker: string;
  trailing_12m_czk: number;
  prior_12m_czk: number;
  growth_pct: number | null;
}

export interface Overview {
  value_czk: number;
  invested_czk: number;
  withdrawn_czk: number;
  total_gain_czk: number;
  total_gain_pct: number | null;
  realized_gain_czk: number;
  net_dividends_czk: number;
  xirr: number | null;
  positions: Position[];
  allocation_by_class: AllocationSlice[];
  allocation_by_currency: AllocationSlice[];
  allocation_by_instrument: AllocationSlice[];
  allocation_by_segment: AllocationSlice[];
  allocation_by_sector: AllocationSlice[];
  concentration_warnings: ConcentrationWarning[];
  upcoming_dividends: UpcomingDividend[];
  trailing_12m_dividends_czk: number;
  dividend_yield_pct: number | null;
  dividend_yield_on_cost_pct: number | null;
  dividends_by_instrument: { ticker: string; value_czk: number }[];
  dividend_growth: DividendGrowth[];
  position_count: number;
  position_count_by_class: Record<string, number>;
  ytd_sales_volume_czk: number;
  ytd_sales_tax_exempt: boolean | null;
  ytd_gain_czk: number | null;
  ytd_gain_pct: number | null;
  ytd_basis_date: string | null;
  ytd_unavailable_reason: string | null;
  positions_missing_price: string[];
  positions_missing_fx: string[];
  warnings: string[];
}

export interface Note {
  id: number;
  symbol: string;
  text: string;
  created_at: string;
}

export interface RebalanceSuggestion {
  asset_class: AssetClass;
  target_pct: number;
  current_pct: number;
  current_value_czk: number;
  target_value_czk: number;
  delta_czk: number;
}

export interface RebalanceResponse {
  targets_sum_pct: number;
  suggestions: RebalanceSuggestion[];
}

export interface TaxLossCandidate {
  instrument_key: string;
  ticker: string;
  lot_date: string;
  quantity: number;
  unrealized_loss_czk: number;
  tax_test_status: TaxTestStatus;
  tax_test_days_remaining: number | null;
}

export interface TaxLossResponse {
  taxable_gain_ytd_czk: number;
  candidates: TaxLossCandidate[];
}

export type AssetCategory = 'CASH' | 'REAL_ESTATE' | 'OTHER';

export interface ManualAsset {
  id: number;
  name: string;
  category: AssetCategory;
  value_czk: number;
  note: string;
  updated_at: string;
}

export interface NetWorth {
  securities_value_czk: number;
  manual_assets: ManualAsset[];
  manual_assets_total_czk: number;
  net_worth_czk: number;
}

export interface Goal {
  id: number;
  name: string;
  target_value_czk: number;
  target_date: string;
  current_value_czk: number;
  progress_pct: number;
  required_annual_return_pct: number | null;
  reached: boolean;
}

export interface Mover {
  instrument_key: string;
  ticker: string;
  currency: string | null;
  price: number | null;
  move_pct: number | null;
  move_czk: number | null;
  error: string | null;
}

export type AlertType =
  | 'watchlist_target'
  | 'concentration'
  | 'tax_test_soon'
  | 'missing_price'
  | 'missing_fx';
export type AlertSeverity = 'success' | 'warning' | 'info';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  link: string;
}

export interface MarketQuote {
  key: string;
  label: string;
  price: number | null;
  change_pct: number | null;
  currency: string | null;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  exchange: string;
  currency: string;
  asset_class: AssetClass;
  name: string;
  group_name: string;
  target_price: number;
  note: string;
  added_at: string;
  price_at_add: number | null;
  current_price: number | null;
  price_as_of: string | null;
  distance_to_target_pct: number | null;
  change_since_added_pct: number | null;
  target_reached: boolean;
  archived_at: string | null;
  moved_to_portfolio_id: number | null;
}

export type ImportRowStatus = 'ok' | 'warning' | 'error' | 'duplicate';

export interface ImportRow {
  line_number: number;
  status: ImportRowStatus;
  messages: string[];
  data: Record<string, unknown> | null;
  raw: Record<string, string>;
}

export interface ImportPreview {
  delimiter: string;
  fatal_error: string | null;
  new_portfolios: string[];
  counts: Record<ImportRowStatus, number>;
  rows: ImportRow[];
  token: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  created_portfolios: string[];
}

export interface Snapshot {
  date: string;
  value_czk: number;
  invested_czk: number;
  benchmark_czk: number | null;
}

export interface BenchmarkComparison {
  ticker: string;
  benchmark_value_czk: number | null;
  portfolio_value_czk: number;
  difference_czk: number | null;
  computed_at: string;
  is_manual: boolean;
  note: string | null;
}

export interface PriceQuote {
  instrument_key: string;
  price: number | null;
  currency: string | null;
  is_manual: boolean;
  as_of: string | null;
  error: string | null;
}

export interface RefreshResult {
  refreshed: number;
  missing: string[];
  quotes: PriceQuote[];
}

export interface HoldingsInput {
  tickers: string[];
  weights: number[];
  excluded: { ticker: string; reason: string }[];
  start_date?: string;
  end_date?: string;
  risk_free_rate?: number;
  note: string | null;
}

// --- AI analysis -----------------------------------------------------------

export interface ScoreFactor {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  points: number;
  max_points: number;
  explanation: string;
}

export interface SubScore {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  coverage: number;
  factors: ScoreFactor[];
  unavailable_reason: string | null;
}

export interface Assessment {
  score: number | null;
  verdict: string;
  verdict_detail: string;
  confidence: number;
  confidence_label: string;
  subscores: SubScore[];
  missing_inputs: string[];
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface Technicals {
  points: PricePoint[];
  first_date: string | null;
  last_date: string | null;
  observations: number;
  sma50: number | null;
  sma200: number | null;
  above_sma50: boolean | null;
  above_sma200: boolean | null;
  cross_state: string;
  cross_state_cs: string;
  rsi14: number | null;
  volatility_annual_pct: number | null;
  max_drawdown_pct: number | null;
  return_1m_pct: number | null;
  return_3m_pct: number | null;
  return_6m_pct: number | null;
  return_1y_pct: number | null;
  momentum_score: number | null;
}

export interface Projection {
  horizon_days: number;
  paths: number;
  seed: number;
  observations: number;
  drift_daily: number | null;
  volatility_daily: number | null;
  start_price: number | null;
  p5: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p95: number | null;
  expected_return_pct: number | null;
  probability_below_current_pct: number | null;
  method: string;
  note: string;
}

export interface TickerAnalysis {
  ticker: string;
  resolved_symbol: string;
  generated_at: string;
  lookback_days: number;
  horizon_days: number;
  quote: Record<string, string | number | null>;
  fundamentals: Record<string, number | null>;
  technicals: Technicals;
  projection: Projection | null;
  consensus: Record<string, string | number | null>;
  assessment: Assessment;
  narrative: { text: string; model: string | null; generated: boolean; note: string | null } | null;
  missing_data: string[];
  disclaimer: string;
}

// --- Quantitative layer (the original analysis tabs) -----------------------

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface QuantAllocationSlice {
  ticker: string;
  weight: number;
}

export interface AnalyzeResult {
  metrics: {
    annual_return: number;
    annual_volatility: number;
    sharpe_ratio: number;
    sortino_ratio: number;
    max_drawdown: number;
  };
  equity_curve: SeriesPoint[];
  allocation: QuantAllocationSlice[];
  asset_curves: Record<string, SeriesPoint[]>;
}

export interface QuantBenchmarkResult {
  metrics: {
    beta: number;
    alpha: number;
    tracking_error: number;
    information_ratio: number;
    correlation: number;
    r_squared: number;
    up_capture: number;
    down_capture: number;
    portfolio_return: number;
    benchmark_return: number;
    portfolio_volatility: number;
    benchmark_volatility: number;
  };
  portfolio_curve: SeriesPoint[];
  benchmark_curve: SeriesPoint[];
}

export interface MonteCarloResult {
  final_values: {
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    percentile_5: number;
    percentile_95: number;
    prob_loss: number;
  };
  percentile_bands: Record<string, number[]>;
  initial_investment: number;
  time_horizon: number;
  num_simulations: number;
}

export interface CorrelationResult {
  tickers: string[];
  matrix: number[][];
}

export interface OptimizeResult {
  strategy: string;
  weights: Record<string, number>;
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  current: { return: number; volatility: number; sharpe_ratio: number } | null;
}
