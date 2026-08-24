import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface PortfolioState {
  tickers: string[];
  weights: number[];
  startDate: string;
  endDate: string;
  riskFreeRate: number;
  benchmarkTicker: string;
}

const STORAGE_KEY = 'bfx-portfolio-pro:portfolio';

function defaultState(): PortfolioState {
  const today = new Date();
  const fiveYearsAgo = new Date(today);
  fiveYearsAgo.setFullYear(today.getFullYear() - 5);
  return {
    tickers: ['VTI', 'VXUS', 'BND'],
    weights: [0.4, 0.2, 0.4],
    startDate: fiveYearsAgo.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
    riskFreeRate: 0.04,
    benchmarkTicker: 'SPY',
  };
}

function loadState(): PortfolioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

interface PortfolioContextValue {
  portfolio: PortfolioState;
  setPortfolio: (next: PortfolioState) => void;
  hasPortfolio: boolean;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolioState] = useState<PortfolioState>(loadState);
  const [hasPortfolio, setHasPortfolio] = useState(() => localStorage.getItem(STORAGE_KEY) !== null);

  const setPortfolio = (next: PortfolioState) => {
    setPortfolioState(next);
    setHasPortfolio(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const value = useMemo(() => ({ portfolio, setPortfolio, hasPortfolio }), [portfolio, hasPortfolio]);

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}

export const PRESET_PORTFOLIOS: Record<string, { tickers: string[]; weights: number[] }> = {
  'Three-Fund Portfolio': { tickers: ['VTI', 'VXUS', 'BND'], weights: [0.4, 0.2, 0.4] },
  '60/40 Traditional': { tickers: ['VTI', 'BND'], weights: [0.6, 0.4] },
  'All-Weather (Ray Dalio)': { tickers: ['VTI', 'TLT', 'IEF', 'GLD', 'DBC'], weights: [0.3, 0.4, 0.15, 0.075, 0.075] },
  'Golden Butterfly': { tickers: ['VTI', 'VBR', 'TLT', 'SHY', 'GLD'], weights: [0.2, 0.2, 0.2, 0.2, 0.2] },
  'Aggressive Growth': { tickers: ['VTI', 'VGT', 'VXUS'], weights: [0.5, 0.25, 0.25] },
  'Conservative Income': { tickers: ['VTI', 'BND', 'VTIP', 'VNQ'], weights: [0.2, 0.5, 0.15, 0.15] },
  'S&P 500 Only': { tickers: ['SPY'], weights: [1] },
  'Total World Stock': { tickers: ['VT'], weights: [1] },
};

export const BENCHMARK_OPTIONS: Record<string, string> = {
  SPY: 'S&P 500 (US Large Cap)',
  VTI: 'Total US Stock Market',
  BND: 'Total US Bond Market',
  VT: 'Total World Stock Market',
  QQQ: 'NASDAQ 100',
  IWM: 'Russell 2000 (US Small Cap)',
  EFA: 'Developed Markets ex-US',
  AGG: 'US Aggregate Bond',
};
