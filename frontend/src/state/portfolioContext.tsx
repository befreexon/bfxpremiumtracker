import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { portfolios as portfolioApi } from '../api/client';
import type { Portfolio } from '../api/types';
import { useAuth } from './authContext';

const SELECTION_KEY = 'bfx-portfolio-pro:selection';

/** `null` means "Vše dohromady" — every portfolio at once. */
export type Selection = number[] | null;

interface PortfolioValue {
  portfolios: Portfolio[];
  selection: Selection;
  selectedIds: number[] | undefined;
  selectionLabel: string;
  loading: boolean;
  error: string | null;
  select: (selection: Selection) => void;
  reload: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioValue | null>(null);

function readSelection(): Selection {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [list, setList] = useState<Portfolio[]>([]);
  const [selection, setSelection] = useState<Selection>(readSelection);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setList([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setList(await portfolioApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portfolia se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = useCallback((next: Selection) => {
    setSelection(next);
    try {
      if (next) localStorage.setItem(SELECTION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SELECTION_KEY);
    } catch {
      // Not being able to remember the choice is not worth an error.
    }
  }, []);

  // A stored selection can point at a portfolio that has since been deleted.
  const validSelection = useMemo<Selection>(() => {
    if (!selection || list.length === 0) return selection;
    const known = new Set(list.map((p) => p.id));
    const kept = selection.filter((id) => known.has(id));
    return kept.length ? kept : null;
  }, [selection, list]);

  const selectionLabel = useMemo(() => {
    if (!validSelection) return 'Vše dohromady';
    const names = list.filter((p) => validSelection.includes(p.id)).map((p) => p.name);
    return names.length === 1 ? names[0] : `${names.length} portfolií`;
  }, [validSelection, list]);

  const value = useMemo<PortfolioValue>(
    () => ({
      portfolios: list,
      selection: validSelection,
      selectedIds: validSelection ?? undefined,
      selectionLabel,
      loading,
      error,
      select,
      reload,
    }),
    [list, validSelection, selectionLabel, loading, error, select, reload],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolios(): PortfolioValue {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error('usePortfolios musí být uvnitř PortfolioProvider');
  return context;
}
