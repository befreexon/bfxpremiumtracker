/**
 * Shared pieces of the watchlist layer.
 *
 * The layer sits on the dark canvas, so every colour here is the on-dark
 * variant. Gold is the only accent: it marks the one thing that needs a human
 * — a title that has reached the price you wrote down for it. Green and red
 * stay reserved for gain and loss, and never carry meaning alone.
 */

import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import type { AssetClass, WatchlistItem } from '../../api/types';

// --- Palette ---------------------------------------------------------------

export const SURFACE = 'var(--surface-elevated)';
export const HAIRLINE = 'var(--hairline-dark)';
export const MUTED = 'var(--on-dark-mute)';
export const GOLD = 'var(--gold)';

/** The wash behind a row whose condition has occurred. Gold, never green. */
export const REACHED_WASH = 'rgba(220,180,92,0.10)';
export const REACHED_WASH_STRONG = 'rgba(220,180,92,0.16)';

export const CAPTION = {
  fontSize: 13,
  lineHeight: 1.5,
  color: MUTED,
} as const;

// --- Domain constants ------------------------------------------------------

/** Mirrors the backend defaults, used when `watchlist.groups()` cannot load. */
export const DEFAULT_GROUPS = ['Čekám na vstup', 'Sleduji', 'Zamítnuto'];

/** Beyond this a watchlist stops being something a person actually reviews. */
export const SUGGESTED_MAX_ITEMS = 50;

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  STOCK: 'Akcie',
  ETF: 'ETF',
  CRYPTO: 'Krypto',
};

export const ASSET_CLASS_ORDER: AssetClass[] = ['STOCK', 'ETF', 'CRYPTO'];

export function assetClassFromLabel(label: string): AssetClass {
  const found = ASSET_CLASS_ORDER.find((key) => ASSET_CLASS_LABELS[key] === label);
  return found ?? 'STOCK';
}

export const CURRENCIES = ['CZK', 'USD', 'EUR', 'GBP', 'CHF', 'PLN'];

// --- Sorting ---------------------------------------------------------------

export type SortKey =
  | 'ticker'
  | 'current_price'
  | 'target_price'
  | 'distance_to_target_pct'
  | 'change_since_added_pct'
  | 'added_at';

export interface SortState {
  key: SortKey;
  direction: 1 | -1;
}

/** Ascending distance first: the API already returns them this way. */
export const DEFAULT_SORT: SortState = { key: 'distance_to_target_pct', direction: 1 };

export interface ColumnSpec {
  key: SortKey;
  label: string;
  numeric: boolean;
  /** Short form for the sort control on a narrow screen. */
  shortLabel: string;
  hint?: string;
}

export const COLUMNS: ColumnSpec[] = [
  { key: 'ticker', label: 'Ticker', shortLabel: 'Ticker', numeric: false },
  { key: 'current_price', label: 'Aktuální cena', shortLabel: 'Aktuální', numeric: true },
  { key: 'target_price', label: 'Cílová cena', shortLabel: 'Cílová', numeric: true },
  {
    key: 'distance_to_target_pct',
    label: 'Vzdálenost k cíli %',
    shortLabel: 'Vzdálenost',
    numeric: true,
    hint: 'Kladné číslo = cena je nad cílovou a musí ještě klesnout. Nula nebo méně = cíl je dosažen.',
  },
  {
    key: 'change_since_added_pct',
    label: 'Od přidání %',
    shortLabel: 'Od přidání',
    numeric: true,
    hint: 'Jak se titul pohnul od chvíle, kdy sis ho zapsal.',
  },
  { key: 'added_at', label: 'Přidáno', shortLabel: 'Přidáno', numeric: false },
];

const NUMERIC_KEYS: SortKey[] = [
  'current_price',
  'target_price',
  'distance_to_target_pct',
  'change_since_added_pct',
];

function numericValue(item: WatchlistItem, key: SortKey): number | null {
  switch (key) {
    case 'current_price':
      return item.current_price;
    case 'target_price':
      return item.target_price;
    case 'distance_to_target_pct':
      return item.distance_to_target_pct;
    case 'change_since_added_pct':
      return item.change_since_added_pct;
    default:
      return null;
  }
}

export function compareItems(a: WatchlistItem, b: WatchlistItem, sort: SortState): number {
  const { key, direction } = sort;

  if (key === 'ticker') return a.ticker.localeCompare(b.ticker, 'cs') * direction;
  if (key === 'added_at') {
    if (a.added_at === b.added_at) return a.ticker.localeCompare(b.ticker, 'cs');
    return (a.added_at < b.added_at ? -1 : 1) * direction;
  }
  if (!NUMERIC_KEYS.includes(key)) return 0;

  const left = numericValue(a, key);
  const right = numericValue(b, key);
  // A missing number is not a small number. It always sinks to the bottom,
  // whichever way the column is sorted.
  if (left === null && right === null) return a.ticker.localeCompare(b.ticker, 'cs');
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return a.ticker.localeCompare(b.ticker, 'cs');
  return (left < right ? -1 : 1) * direction;
}

// --- Grouping --------------------------------------------------------------

export interface GroupBlock {
  name: string;
  items: WatchlistItem[];
  activeCount: number;
  archivedCount: number;
  reachedCount: number;
}

/**
 * Buckets by `group_name`, then inside each bucket puts the titles whose
 * condition has occurred first, the archived ones last, and the rest in the
 * order the user asked for.
 */
export function buildGroups(
  items: WatchlistItem[],
  sort: SortState,
  groupOrder: string[],
): GroupBlock[] {
  const buckets = new Map<string, WatchlistItem[]>();
  for (const item of items) {
    const name = item.group_name || 'Bez skupiny';
    const bucket = buckets.get(name);
    if (bucket) bucket.push(item);
    else buckets.set(name, [item]);
  }

  const blocks: GroupBlock[] = [];
  for (const [name, bucket] of buckets) {
    const sorted = [...bucket].sort((a, b) => {
      const aArchived = a.archived_at !== null;
      const bArchived = b.archived_at !== null;
      if (aArchived !== bArchived) return aArchived ? 1 : -1;
      if (!aArchived && a.target_reached !== b.target_reached) return a.target_reached ? -1 : 1;
      return compareItems(a, b, sort);
    });
    blocks.push({
      name,
      items: sorted,
      activeCount: sorted.filter((item) => item.archived_at === null).length,
      archivedCount: sorted.filter((item) => item.archived_at !== null).length,
      reachedCount: sorted.filter((item) => item.archived_at === null && item.target_reached).length,
    });
  }

  // A group holding a title that has reached its price comes first — that is
  // the only thing on this screen that is asking for a decision.
  blocks.sort((a, b) => {
    if ((a.reachedCount > 0) !== (b.reachedCount > 0)) return a.reachedCount > 0 ? -1 : 1;
    const ai = groupOrder.indexOf(a.name);
    const bi = groupOrder.indexOf(b.name);
    if (ai !== bi) return (ai === -1 ? groupOrder.length : ai) - (bi === -1 ? groupOrder.length : bi);
    return a.name.localeCompare(b.name, 'cs');
  });

  return blocks;
}

// --- Numbers and errors ----------------------------------------------------

/** Accepts `1 234,50` as readily as `1234.5`. Returns null for anything else. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Turns whatever the client threw into a sentence that says what happened.
 * The API already speaks Czech; the fallback covers everything else.
 */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// --- Environment hooks -----------------------------------------------------

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** Below this the table stops being readable and becomes a list of cards. */
export const useIsNarrow = () => useMediaQuery('(max-width: 900px)');

/** Motion is a nicety; anyone who has asked for less of it gets none. */
export const useMotionOk = () => !useMediaQuery('(prefers-reduced-motion: reduce)');

/** Closes a dialog on Escape without trapping anything else. */
export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [active, onEscape]);
}
