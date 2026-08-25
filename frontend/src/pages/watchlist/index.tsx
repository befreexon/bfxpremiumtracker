/**
 * The watchlist layer: titles I want to own but do not yet — and above all,
 * the condition on which I would buy them.
 *
 * The decision is made calmly, at the moment of writing it down. From then on
 * the tool only watches whether the condition has occurred. That separation
 * between the analysis and the impulse is the entire point of this screen, and
 * it is why the target price is mandatory and why nothing here ever says
 * "buy" — the gold tag reports a fact and hands the decision back.
 *
 * Renders inside the app shell, which owns the nav and the portfolio switcher.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { watchlist } from '../../api/client';
import type { WatchlistItem } from '../../api/types';
import { Button, Switch } from '../../design/components';
import { dateTime } from '../../lib/format';
import { AddItemPanel } from './AddItemPanel';
import { BuyDialog } from './BuyDialog';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { EditDialog } from './EditDialog';
import { DarkHint, DarkNotice } from './fields';
import {
  CAPTION,
  DEFAULT_GROUPS,
  DEFAULT_SORT,
  GOLD,
  HAIRLINE,
  MUTED,
  SUGGESTED_MAX_ITEMS,
  buildGroups,
  errorText,
  useIsNarrow,
  useMotionOk,
  type SortKey,
  type SortState,
} from './shared';
import { REACHED_LABEL, WatchlistTable } from './WatchlistTable';

export function WatchlistLayer() {
  const narrow = useIsNarrow();
  const motionOk = useMotionOk();

  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set<string>());

  const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [groupsFellBack, setGroupsFellBack] = useState(false);
  const [groupsVersion, setGroupsVersion] = useState(0);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WatchlistItem | null>(null);
  const [buying, setBuying] = useState<WatchlistItem | null>(null);
  const [deleting, setDeleting] = useState<WatchlistItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A slow refresh must not be able to overwrite a newer result.
  const requestId = useRef(0);

  const load = useCallback(
    async (refresh: boolean) => {
      const id = ++requestId.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await watchlist.list(includeArchived, refresh);
        if (id !== requestId.current) return;
        setItems(data);
      } catch (cause) {
        if (id !== requestId.current) return;
        setError(
          errorText(
            cause,
            'Watchlist se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.',
          ),
        );
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [includeArchived],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    watchlist
      .groups()
      .then((names) => {
        if (cancelled) return;
        setGroups(names.length > 0 ? names : DEFAULT_GROUPS);
        setGroupsFellBack(false);
      })
      .catch(() => {
        if (cancelled) return;
        setGroups(DEFAULT_GROUPS);
        setGroupsFellBack(true);
      });
    return () => {
      cancelled = true;
    };
  }, [groupsVersion]);

  const groupOrder = useMemo(() => groups, [groups]);
  const blocks = useMemo(() => buildGroups(items, sort, groupOrder), [items, sort, groupOrder]);

  const activeItems = useMemo(() => items.filter((item) => item.archived_at === null), [items]);
  const archivedCount = items.length - activeItems.length;
  const reached = useMemo(() => activeItems.filter((item) => item.target_reached), [activeItems]);

  const pricesAsOf = useMemo(() => {
    const stamps = items.map((item) => item.price_as_of).filter((value): value is string => !!value);
    if (stamps.length === 0) return null;
    return stamps.reduce((latest, value) => (value > latest ? value : latest));
  }, [items]);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 1 ? -1 : 1 }
        : { key, direction: key === 'ticker' ? 1 : 1 },
    );
  };

  const toggleGroup = (name: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const afterMutation = (message: string, reloadGroups = false) => {
    setNotice(message);
    if (reloadGroups) setGroupsVersion((version) => version + 1);
    void load(false);
  };

  return (
    <div
      style={{
        background: 'var(--canvas-dark)',
        color: 'var(--on-dark)',
        fontFamily: 'var(--font-body)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <Toolbar
        narrow={narrow}
        adding={adding}
        refreshing={refreshing}
        loading={loading}
        includeArchived={includeArchived}
        archivedCount={archivedCount}
        pricesAsOf={pricesAsOf}
        onToggleAdd={() => setAdding((open) => !open)}
        onRefresh={() => void load(true)}
        onToggleArchived={setIncludeArchived}
      />

      {notice && (
        <DarkNotice
          action={
            <Button size="sm" variant="outline-dark" onClick={() => setNotice(null)}>
              Rozumím
            </Button>
          }
        >
          {notice}
        </DarkNotice>
      )}

      {groupsFellBack && (
        <DarkNotice>
          Seznam skupin se nenačetl, takže jsou k dispozici jen výchozí tři. Vlastní skupinu můžeš
          i tak napsat ručně.
        </DarkNotice>
      )}

      {adding && (
        <AddItemPanel
          groups={groups}
          onCancel={() => setAdding(false)}
          onCreated={(item) => {
            setAdding(false);
            afterMutation(
              `${item.ticker} je na watchlistu s cílovou cenou. Teď už jen čekáš, jestli ta cena přijde.`,
              true,
            );
          }}
        />
      )}

      {error && (
        <DarkNotice
          tone="danger"
          action={
            <Button size="sm" variant="outline-dark" onClick={() => void load(false)}>
              Zkusit znovu
            </Button>
          }
        >
          {error}
        </DarkNotice>
      )}

      {!error && reached.length > 0 && (
        <DarkNotice tone="gold">
          <strong>{reachedHeadline(reached.length)}</strong>{' '}
          {reached.map((item) => item.ticker).join(', ')} — {REACHED_LABEL.toLowerCase()}. Podmínku
          sis stanovil dopředu; teď je na řadě rozhodnutí, ne reakce.
        </DarkNotice>
      )}

      {loading ? (
        <LoadingBlock />
      ) : error && items.length === 0 ? null : items.length === 0 ? (
        <EmptyBlock includeArchived={includeArchived} onAdd={() => setAdding(true)} />
      ) : (
        <WatchlistTable
          groups={blocks}
          collapsed={collapsed}
          onToggleGroup={toggleGroup}
          sort={sort}
          onSort={toggleSort}
          narrow={narrow}
          motionOk={motionOk}
          onBuy={setBuying}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
      )}

      {!loading && items.length > 0 && <Legend includeArchived={includeArchived} />}

      {activeItems.length > SUGGESTED_MAX_ITEMS && (
        <DarkHint>
          Na seznamu je {activeItems.length} aktivních titulů. Watchlist nad zhruba{' '}
          {SUGGESTED_MAX_ITEMS} titulů přestává být něco, co člověk skutečně prochází — stojí za to
          ho prořezat. Co bys dnes už znovu nepřidal, patří do skupiny Zamítnuto.
        </DarkHint>
      )}

      {editing && (
        <EditDialog
          item={editing}
          groups={groups}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            afterMutation(`Změny u ${updated.ticker} jsou uložené.`, true);
          }}
        />
      )}

      {buying && (
        <BuyDialog
          item={buying}
          onClose={() => setBuying(null)}
          onBought={(message) => {
            setBuying(null);
            afterMutation(message);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          item={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(message) => {
            setDeleting(null);
            afterMutation(message, true);
          }}
        />
      )}
    </div>
  );
}

function reachedHeadline(count: number): string {
  if (count === 1) return '1 titul je na cílové ceně:';
  if (count >= 2 && count <= 4) return `${count} tituly jsou na cílové ceně:`;
  return `${count} titulů je na cílové ceně:`;
}

// --- Toolbar ---------------------------------------------------------------

function Toolbar({
  narrow,
  adding,
  refreshing,
  loading,
  includeArchived,
  archivedCount,
  pricesAsOf,
  onToggleAdd,
  onRefresh,
  onToggleArchived,
}: {
  narrow: boolean;
  adding: boolean;
  refreshing: boolean;
  loading: boolean;
  includeArchived: boolean;
  archivedCount: number;
  pricesAsOf: string | null;
  onToggleAdd: () => void;
  onRefresh: () => void;
  onToggleArchived: (value: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: narrow ? 'stretch' : 'center',
        flexDirection: narrow ? 'column' : 'row',
        gap: 12,
        flexWrap: 'wrap',
        paddingBottom: 16,
        borderBottom: `1px solid ${HAIRLINE}`,
      }}
    >
      <Button onClick={onToggleAdd}>{adding ? 'Skrýt formulář' : 'Přidat titul'}</Button>

      <Button variant="outline-dark" onClick={onRefresh} disabled={refreshing || loading}>
        {refreshing ? 'Načítám ceny…' : 'Aktualizovat ceny'}
      </Button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch checked={includeArchived} onChange={onToggleArchived} />
        <span style={{ fontSize: 14, color: includeArchived ? '#fff' : MUTED }}>
          Zobrazit archiv
          {archivedCount > 0 && includeArchived ? ` (${archivedCount})` : ''}
        </span>
      </div>

      <span style={{ ...CAPTION, marginLeft: narrow ? 0 : 'auto', textAlign: narrow ? 'left' : 'right' }}>
        {pricesAsOf ? `Ceny k ${dateTime(pricesAsOf)}` : 'Ceny zatím nenačtené'}
      </span>
    </div>
  );
}

// --- States ----------------------------------------------------------------

function LoadingBlock() {
  return (
    <div
      style={{
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 'var(--radius-md)',
        padding: 28,
        color: MUTED,
        fontSize: 15,
      }}
    >
      Načítám watchlist…
    </div>
  );
}

function EmptyBlock({
  includeArchived,
  onAdd,
}: {
  includeArchived: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 'var(--radius-lg)',
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, maxWidth: 620, color: '#fff' }}>
        Sem patří ticker — a cena, za kterou bys ho koupil.
      </p>
      <p style={{ margin: 0, ...CAPTION, maxWidth: 620 }}>
        To druhé je to podstatné: rozhodnutí uděláš teď, v klidu, a aplikace pak už jen hlídá,
        jestli ta cena přišla.
        {includeArchived ? ' V archivu zatím také nic není.' : ''}
      </p>
      <Button onClick={onAdd}>Přidat první titul</Button>
    </div>
  );
}

// --- Captions --------------------------------------------------------------

function Legend({ includeArchived }: { includeArchived: boolean }) {
  return (
    <div
      style={{
        borderTop: `1px solid ${HAIRLINE}`,
        paddingTop: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 760,
      }}
    >
      <DarkHint>
        <strong style={{ color: '#fff' }}>Od přidání %</strong> ukazuje, jak se titul pohnul od
        chvíle, kdy sis ho zapsal. Je to jediné místo, kde uvidíš, jak by dopadly nákupy, které jsi
        neudělal — nepříjemné a užitečné zároveň.
      </DarkHint>

      <DarkHint>
        <strong style={{ color: '#fff' }}>Vzdálenost k cíli %</strong> je rozdíl aktuální a cílové
        ceny. Kladné číslo znamená, že cena je nad cílovou a musí ještě klesnout; nula nebo méně
        znamená, že podmínka nastala — takový řádek je zlatě podbarvený a stojí v čele své skupiny.
      </DarkHint>

      <DarkHint>
        Titul bez ceny má štítek <span style={{ color: GOLD }}>Cena chybí</span>; nikdy se
        nedopočítává číslo, které není známé.
        {includeArchived
          ? ' Archivované položky jsou ztlumené a nesou datum archivace, aby si seznam pamatoval, odkud každá pozice přišla.'
          : ''}
      </DarkHint>
    </div>
  );
}
