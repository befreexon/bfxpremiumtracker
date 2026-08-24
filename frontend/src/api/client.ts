const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface AllocationSlice {
  ticker: string;
  weight: number;
}

export interface PortfolioInput {
  tickers: string[];
  weights: number[];
  start_date: string;
  end_date: string;
  risk_free_rate: number;
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
  allocation: AllocationSlice[];
  asset_curves: Record<string, SeriesPoint[]>;
}

export interface BenchmarkResult {
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

export interface OptimizeResult {
  strategy: string;
  weights: Record<string, number>;
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  current: { return: number; volatility: number; sharpe_ratio: number } | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed with status ${res.status}`);
  }
  return res.json();
}

export function analyzePortfolio(input: PortfolioInput) {
  return post<AnalyzeResult>('/api/portfolio/analyze', input);
}

export function compareBenchmark(input: PortfolioInput & { benchmark_ticker: string }) {
  return post<BenchmarkResult>('/api/portfolio/benchmark', input);
}

export function runMonteCarlo(
  input: PortfolioInput & { num_simulations: number; time_horizon: number; initial_investment: number },
) {
  return post<MonteCarloResult>('/api/portfolio/monte-carlo', input);
}

export function optimizePortfolio(input: {
  tickers: string[];
  current_weights?: number[];
  start_date: string;
  end_date: string;
  risk_free_rate: number;
  strategy: string;
}) {
  return post<OptimizeResult>('/api/portfolio/optimize', input);
}
