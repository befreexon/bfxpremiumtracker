/**
 * API client.
 *
 * The token is held in memory and mirrored to localStorage so a reload does not
 * sign the user out. Every 401 clears it and notifies the listener the auth
 * provider registers, so an expired session ends up on the sign-in screen
 * rather than in a wall of failed requests.
 */

import type {
  Alert,
  AnalyzeResult,
  BenchmarkComparison,
  HoldingsInput,
  ImportPreview,
  ImportResult,
  MarketQuote,
  Note,
  Overview,
  Portfolio,
  Position,
  RebalanceResponse,
  RefreshResult,
  MonteCarloResult,
  OptimizeResult,
  QuantBenchmarkResult,
  Segment,
  Snapshot,
  TickerAnalysis,
  Transaction,
  User,
  WatchlistItem,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'bfx-portfolio-pro:token';

let token: string | null = readStoredToken();
let onUnauthorized: (() => void) | null = null;

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(next: string | null): void {
  token = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // A private window blocks storage; the session simply ends on reload.
  }
}

export function getToken(): string | null {
  return token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    // Pydantic validation errors arrive as a list of field problems.
    if (Array.isArray(detail)) {
      return detail
        .map((item) => item?.msg ?? '')
        .filter(Boolean)
        .join(' · ');
    }
  } catch {
    // Fall through to the status text.
  }
  return `Požadavek selhal (${response.status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Server neodpovídá. Běží backend na portu 8000?', 0);
  }

  if (response.status === 401) {
    setToken(null);
    onUnauthorized?.();
    throw new ApiError('Přihlášení vypršelo. Přihlas se znovu.', 401);
  }
  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  return (await response.text()) as T;
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else search.append(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// --- Auth ------------------------------------------------------------------

export const auth = {
  async register(email: string, password: string, displayName = ''): Promise<string> {
    const result = await request<{ access_token: string }>(
      '/api/auth/register',
      json('POST', { email, password, display_name: displayName }),
    );
    setToken(result.access_token);
    return result.access_token;
  },

  async login(email: string, password: string): Promise<string> {
    // The token endpoint takes form encoding, per the OAuth2 password flow.
    const body = new URLSearchParams({ username: email, password });
    const result = await request<{ access_token: string }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    setToken(result.access_token);
    return result.access_token;
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
    }
  },

  me: () => request<User>('/api/auth/me'),

  updateSettings: (patch: Partial<Omit<User, 'id' | 'email'>>) =>
    request<User>('/api/auth/me', json('PATCH', patch)),
};

// --- Portfolios and transactions -------------------------------------------

export const portfolios = {
  list: () => request<Portfolio[]>('/api/portfolios'),
  create: (name: string, note = '') => request<Portfolio>('/api/portfolios', json('POST', { name, note })),
  update: (id: number, patch: { name?: string; note?: string }) =>
    request<Portfolio>(`/api/portfolios/${id}`, json('PATCH', patch)),
  remove: (id: number) => request<void>(`/api/portfolios/${id}`, { method: 'DELETE' }),

  transactions: (id: number, ticker?: string) =>
    request<Transaction[]>(`/api/portfolios/${id}/transactions${query({ ticker })}`),

  addTransaction: (id: number, payload: Partial<Transaction>) =>
    request<Transaction>(`/api/portfolios/${id}/transactions`, json('POST', payload)),

  updateTransaction: (id: number, txId: number, patch: Partial<Transaction>) =>
    request<Transaction>(`/api/portfolios/${id}/transactions/${txId}`, json('PATCH', patch)),

  removeTransaction: (id: number, txId: number) =>
    request<void>(`/api/portfolios/${id}/transactions/${txId}`, { method: 'DELETE' }),
};

// --- Transaction journal (spans portfolios, unlike portfolios.transactions) --

export const journal = {
  list: (portfolioIds?: number[], limit = 200) =>
    request<Transaction[]>(`/api/transactions${query({ portfolio_ids: portfolioIds, limit })}`),
};

// --- Segments ("Vlastní rozdělení") -----------------------------------------

export const segments = {
  list: () => request<Segment[]>('/api/segments'),

  create: (name: string, color: string) =>
    request<Segment>('/api/segments', json('POST', { name, color })),

  update: (id: number, patch: { name?: string; color?: string }) =>
    request<Segment>(`/api/segments/${id}`, json('PATCH', patch)),

  remove: (id: number) => request<void>(`/api/segments/${id}`, { method: 'DELETE' }),

  assign: (instrumentKey: string, segmentId: number | null) =>
    request<{ instrument_key: string; segment_id: number | null }>(
      '/api/segments/assign',
      json('PUT', { instrument_key: instrumentKey, segment_id: segmentId }),
    ),
};

// --- Overview --------------------------------------------------------------

export const overview = {
  get: (portfolioIds?: number[], refresh = false) =>
    request<Overview>(`/api/overview${query({ portfolio_ids: portfolioIds, refresh })}`),

  position: (instrumentKey: string, portfolioIds?: number[]) =>
    request<Position>(
      `/api/positions/${encodeURIComponent(instrumentKey)}${query({ portfolio_ids: portfolioIds })}`,
    ),
};

// --- Prices ----------------------------------------------------------------

export const prices = {
  refresh: (portfolioIds?: number[]) =>
    request<RefreshResult>('/api/prices/refresh', json('POST', { portfolio_ids: portfolioIds ?? null })),

  setManual: (instrumentKey: string, price: number) =>
    request<{ instrument_key: string; price: number; set_at: string }>(
      '/api/prices/manual',
      json('PUT', { instrument_key: instrumentKey, price }),
    ),

  clearManual: (instrumentKey: string) =>
    request<void>(`/api/prices/manual/${encodeURIComponent(instrumentKey)}`, { method: 'DELETE' }),

  setFx: (currency: string, date: string, rate: number) =>
    request<{ currency: string; date: string; rate: number }>(
      '/api/prices/fx',
      json('PUT', { currency, date, rate }),
    ),

  backfillFx: (portfolioIds?: number[]) =>
    request<{ filled: number; still_missing: { id: number; ticker: string; date: string }[] }>(
      '/api/prices/fx/backfill',
      json('POST', { portfolio_ids: portfolioIds ?? null }),
    ),
};

// --- CSV -------------------------------------------------------------------

export const csv = {
  preview: (file: File, portfolioId?: number) => {
    const form = new FormData();
    form.append('file', file);
    return request<ImportPreview>(`/api/import/preview${query({ portfolio_id: portfolioId })}`, {
      method: 'POST',
      body: form,
    });
  },

  commit: (importToken: string, portfolioId?: number) =>
    request<ImportResult>(
      '/api/import/commit',
      json('POST', { token: importToken, portfolio_id: portfolioId ?? null }),
    ),

  exportUrl: (portfolioIds?: number[]) => `${API_BASE}/api/export.csv${query({ portfolio_ids: portfolioIds })}`,

  templateUrl: (sample = false) => `${API_BASE}/api/import/template.csv${query({ sample })}`,

  /** Downloads through fetch so the Authorization header travels with it. */
  async download(url: string, filename: string): Promise<void> {
    const response = await fetch(url, { headers: authHeaders() });
    if (!response.ok) throw new ApiError(await readError(response), response.status);
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  },
};

// --- Watchlist -------------------------------------------------------------

export const watchlist = {
  list: (includeArchived = false, refresh = false) =>
    request<WatchlistItem[]>(`/api/watchlist${query({ include_archived: includeArchived, refresh })}`),

  create: (payload: {
    ticker: string;
    exchange: string;
    currency: string;
    asset_class?: string;
    name?: string;
    group_name?: string;
    target_price: number;
    note?: string;
  }) => request<WatchlistItem>('/api/watchlist', json('POST', payload)),

  update: (
    id: number,
    patch: { group_name?: string; target_price?: number; note?: string; name?: string },
  ) => request<WatchlistItem>(`/api/watchlist/${id}`, json('PATCH', patch)),

  remove: (id: number) => request<void>(`/api/watchlist/${id}`, { method: 'DELETE' }),

  buy: (
    id: number,
    payload: {
      portfolio_id: number;
      date: string;
      quantity: number;
      price: number;
      fee?: number;
      fx_rate?: number | null;
    },
  ) => request<{ transaction_id: number; archived: boolean }>(`/api/watchlist/${id}/buy`, json('POST', payload)),

  groups: () => request<string[]>('/api/watchlist/groups'),
};

// --- Snapshots and benchmark -----------------------------------------------

export const snapshots = {
  list: (portfolioIds?: number[]) => request<Snapshot[]>(`/api/snapshots${query({ portfolio_ids: portfolioIds })}`),
  take: (portfolioIds?: number[]) => request<Snapshot[]>(`/api/snapshots${query({ portfolio_ids: portfolioIds })}`, { method: 'POST' }),
  benchmark: (portfolioIds?: number[]) =>
    request<BenchmarkComparison>(`/api/benchmark${query({ portfolio_ids: portfolioIds })}`),
  setBenchmark: (portfolioId: number, valueCzk: number) =>
    request<BenchmarkComparison>('/api/benchmark/manual', json('PUT', { portfolio_id: portfolioId, value_czk: valueCzk })),
};

// --- Quantitative layer ----------------------------------------------------

export interface QuantInput {
  tickers: string[];
  weights: number[];
  start_date: string;
  end_date: string;
  risk_free_rate: number;
}

export const quant = {
  fromHoldings: (portfolioIds?: number[], years = 5) =>
    request<HoldingsInput>(`/api/portfolio/from-holdings${query({ portfolio_ids: portfolioIds, years })}`),

  analyze: (input: QuantInput) => request<AnalyzeResult>('/api/portfolio/analyze', json('POST', input)),

  benchmark: (input: QuantInput & { benchmark_ticker: string }) =>
    request<QuantBenchmarkResult>('/api/portfolio/benchmark', json('POST', input)),

  monteCarlo: (
    input: QuantInput & { num_simulations: number; time_horizon: number; initial_investment: number },
  ) => request<MonteCarloResult>('/api/portfolio/monte-carlo', json('POST', input)),

  optimize: (input: {
    tickers: string[];
    current_weights?: number[];
    start_date: string;
    end_date: string;
    risk_free_rate: number;
    strategy: string;
  }) => request<OptimizeResult>('/api/portfolio/optimize', json('POST', input)),
};

export type * from './types';

// --- AI analysis -----------------------------------------------------------

export const ai = {
  analyze: (payload: {
    ticker: string;
    exchange?: string;
    horizon_days?: number;
    lookback_days?: number;
    include_narrative?: boolean;
  }) => request<TickerAnalysis>('/api/ai/analyze', json('POST', payload)),
};

// --- Notes (per-ticker, AI analýza) -----------------------------------------

export const notes = {
  list: (symbol: string) => request<Note[]>(`/api/notes${query({ symbol })}`),
  create: (symbol: string, text: string) => request<Note>('/api/notes', json('POST', { symbol, text })),
  remove: (id: number) => request<void>(`/api/notes/${id}`, { method: 'DELETE' }),
};

// --- Markets overview --------------------------------------------------------

export const markets = {
  overview: () => request<MarketQuote[]>('/api/markets/overview'),
};

// --- Alerts ------------------------------------------------------------------

export const alerts = {
  list: (portfolioIds?: number[]) => request<Alert[]>(`/api/alerts${query({ portfolio_ids: portfolioIds })}`),
};

// --- Rebalancing ---------------------------------------------------------

export const rebalance = {
  getTargets: () => request<Record<string, number>>('/api/rebalance/targets'),
  setTargets: (targets: Record<string, number>) =>
    request<Record<string, number>>('/api/rebalance/targets', json('PUT', { targets })),
  get: (portfolioIds?: number[]) =>
    request<RebalanceResponse>(`/api/rebalance${query({ portfolio_ids: portfolioIds })}`),
};
