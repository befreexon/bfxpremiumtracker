/**
 * The list itself — the content of this layer.
 *
 * Wide screens get a table, because a watchlist is a set of numbers meant to
 * be compared column by column. Below ~900px the same rows become cards; a
 * six-column money table on a phone is not a table, it is a puzzle.
 *
 * A title whose price has arrived is washed in gold and sits at the top of its
 * group. The tag says the condition has occurred and nothing more — the buying
 * is a decision, not something a table gets to instruct.
 */

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { WatchlistItem } from '../../api/types';
import { Badge, Button, Tag } from '../../design/components';
import {
  MISSING,
  NUMERIC_STYLE,
  TONE_COLOR_ON_DARK,
  arrowFor,
  date as formatDate,
  money,
  percent,
  toneFor,
} from '../../lib/format';
import {
  COLUMNS,
  GOLD,
  HAIRLINE,
  MUTED,
  REACHED_WASH,
  REACHED_WASH_STRONG,
  SURFACE,
  type GroupBlock,
  type SortKey,
  type SortState,
} from './shared';

export const REACHED_LABEL = 'Cena dosažena — rozhodni se';

interface WatchlistTableProps {
  groups: GroupBlock[];
  collapsed: ReadonlySet<string>;
  onToggleGroup: (name: string) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  narrow: boolean;
  motionOk: boolean;
  onBuy: (item: WatchlistItem) => void;
  onEdit: (item: WatchlistItem) => void;
  onDelete: (item: WatchlistItem) => void;
}

export function WatchlistTable({
  groups,
  collapsed,
  onToggleGroup,
  sort,
  onSort,
  narrow,
  motionOk,
  onBuy,
  onEdit,
  onDelete,
}: WatchlistTableProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {narrow && <NarrowSortBar sort={sort} onSort={onSort} />}

      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.name);
        return (
          <section key={group.name}>
            <GroupHeader
              group={group}
              collapsed={isCollapsed}
              onToggle={() => onToggleGroup(group.name)}
              motionOk={motionOk}
            />

            {!isCollapsed &&
              (narrow ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                  {group.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onBuy={onBuy}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              ) : (
                <ItemTable
                  items={group.items}
                  sort={sort}
                  onSort={onSort}
                  motionOk={motionOk}
                  onBuy={onBuy}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
          </section>
        );
      })}
    </div>
  );
}

// --- Group header ----------------------------------------------------------

function GroupHeader({
  group,
  collapsed,
  onToggle,
  motionOk,
}: {
  group: GroupBlock;
  collapsed: boolean;
  onToggle: () => void;
  motionOk: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 0',
        border: 'none',
        borderBottom: `1px solid ${HAIRLINE}`,
        background: 'transparent',
        color: '#fff',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: MUTED,
          fontSize: 12,
          display: 'inline-block',
          transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
          transition: motionOk ? 'transform .15s ease-out' : undefined,
        }}
      >
        ▶
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
        {group.name}
      </span>
      <span style={{ fontSize: 13, color: MUTED }}>
        {countLabel(group.activeCount)}
        {group.archivedCount > 0 ? ` · ${group.archivedCount} v archivu` : ''}
      </span>
      {group.reachedCount > 0 && (
        <span style={{ marginLeft: 'auto' }}>
          <Badge tone="gold">
            {group.reachedCount === 1 ? '1 na cílové ceně' : `${group.reachedCount} na cílové ceně`}
          </Badge>
        </span>
      )}
    </button>
  );
}

function countLabel(count: number): string {
  if (count === 1) return '1 titul';
  if (count >= 2 && count <= 4) return `${count} tituly`;
  return `${count} titulů`;
}

// --- Wide table ------------------------------------------------------------

function ItemTable({
  items,
  sort,
  onSort,
  motionOk,
  onBuy,
  onEdit,
  onDelete,
}: {
  items: WatchlistItem[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  motionOk: boolean;
  onBuy: (item: WatchlistItem) => void;
  onEdit: (item: WatchlistItem) => void;
  onDelete: (item: WatchlistItem) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  title={column.hint}
                  aria-sort={active ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'}
                  style={{
                    padding: '10px 12px',
                    borderBottom: `1px solid ${HAIRLINE}`,
                    textAlign: column.numeric ? 'right' : 'left',
                    fontWeight: 600,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: active ? GOLD : MUTED,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      letterSpacing: 'inherit',
                      textTransform: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      flexDirection: column.numeric ? 'row-reverse' : 'row',
                    }}
                  >
                    {column.label}
                    <span aria-hidden="true" style={{ opacity: active ? 1 : 0.35 }}>
                      {active ? (sort.direction === 1 ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                </th>
              );
            })}
            <th
              scope="col"
              style={{
                padding: '10px 12px',
                borderBottom: `1px solid ${HAIRLINE}`,
                textAlign: 'right',
                fontSize: 12,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: MUTED,
                fontWeight: 600,
              }}
            >
              Akce
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              zebra={index % 2 === 1}
              hovered={hovered === item.id}
              motionOk={motionOk}
              onHover={setHovered}
              onBuy={onBuy}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemRow({
  item,
  zebra,
  hovered,
  motionOk,
  onHover,
  onBuy,
  onEdit,
  onDelete,
}: {
  item: WatchlistItem;
  zebra: boolean;
  hovered: boolean;
  motionOk: boolean;
  onHover: (id: number | null) => void;
  onBuy: (item: WatchlistItem) => void;
  onEdit: (item: WatchlistItem) => void;
  onDelete: (item: WatchlistItem) => void;
}) {
  const archived = item.archived_at !== null;
  const reached = !archived && item.target_reached;

  const background = reached
    ? hovered
      ? REACHED_WASH_STRONG
      : REACHED_WASH
    : hovered
      ? 'rgba(255,255,255,0.05)'
      : zebra
        ? 'rgba(255,255,255,0.02)'
        : 'transparent';

  const cell: CSSProperties = {
    padding: '12px',
    borderBottom: `1px solid ${HAIRLINE}`,
    fontSize: 14,
    verticalAlign: 'top',
  };
  const numericCell: CSSProperties = { ...cell, ...NUMERIC_STYLE, whiteSpace: 'nowrap' };

  return (
    <tr
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        background,
        opacity: archived ? 0.55 : 1,
        boxShadow: reached ? `inset 2px 0 0 ${GOLD}` : undefined,
        transition: motionOk ? 'background-color .12s ease-out' : undefined,
      }}
    >
      <td style={cell}>
        <TickerCell item={item} />
      </td>

      <td style={numericCell}>
        <CurrentPrice item={item} />
      </td>

      <td style={{ ...numericCell, color: '#fff', fontWeight: 600 }}>
        {money(item.target_price, item.currency)}
      </td>

      <td style={numericCell}>
        <Distance item={item} />
      </td>

      <td style={numericCell}>
        <ChangeSinceAdded value={item.change_since_added_pct} />
      </td>

      <td style={{ ...cell, whiteSpace: 'nowrap', color: MUTED }}>
        <div style={{ color: '#fff' }}>{formatDate(item.added_at)}</div>
        {archived && (
          <div style={{ fontSize: 12, marginTop: 2 }}>
            Archivováno {formatDate(item.archived_at)}
          </div>
        )}
        {!archived && item.price_at_add !== null && (
          <div style={{ fontSize: 12, marginTop: 2 }}>
            za {money(item.price_at_add, item.currency)}
          </div>
        )}
      </td>

      <td style={{ ...cell, textAlign: 'right' }}>
        <RowActions item={item} onBuy={onBuy} onEdit={onEdit} onDelete={onDelete} align="flex-end" />
      </td>
    </tr>
  );
}

// --- Narrow cards ----------------------------------------------------------

function ItemCard({
  item,
  onBuy,
  onEdit,
  onDelete,
}: {
  item: WatchlistItem;
  onBuy: (item: WatchlistItem) => void;
  onEdit: (item: WatchlistItem) => void;
  onDelete: (item: WatchlistItem) => void;
}) {
  const archived = item.archived_at !== null;
  const reached = !archived && item.target_reached;

  return (
    <article
      style={{
        border: `1px solid ${reached ? GOLD : HAIRLINE}`,
        borderRadius: 'var(--radius-md)',
        background: reached ? REACHED_WASH : SURFACE,
        padding: 16,
        opacity: archived ? 0.6 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <TickerCell item={item} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CardPair label="Aktuální cena">
          <CurrentPrice item={item} align="left" />
        </CardPair>
        <CardPair label="Cílová cena">
          <span style={{ color: '#fff', fontWeight: 600 }}>{money(item.target_price, item.currency)}</span>
        </CardPair>
        <CardPair label="Vzdálenost k cíli">
          <Distance item={item} />
        </CardPair>
        <CardPair label="Od přidání">
          <ChangeSinceAdded value={item.change_since_added_pct} />
        </CardPair>
        <CardPair label="Přidáno">
          <span style={{ color: '#fff' }}>{formatDate(item.added_at)}</span>
        </CardPair>
        {archived && (
          <CardPair label="Archivováno">
            <span style={{ color: '#fff' }}>{formatDate(item.archived_at)}</span>
          </CardPair>
        )}
      </div>

      <RowActions item={item} onBuy={onBuy} onEdit={onEdit} onDelete={onDelete} align="flex-start" />
    </article>
  );
}

function CardPair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{children}</span>
    </div>
  );
}

// --- Cells -----------------------------------------------------------------

function TickerCell({ item }: { item: WatchlistItem }) {
  const archived = item.archived_at !== null;
  const reached = !archived && item.target_reached;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{item.ticker}</span>
        <span style={{ fontSize: 12, color: MUTED }}>
          {item.exchange} · {item.currency}
        </span>
        {reached && <Badge tone="gold">{REACHED_LABEL}</Badge>}
        {archived && <Tag>V archivu</Tag>}
      </div>

      {item.name && (
        <span style={{ fontSize: 13, color: MUTED, overflowWrap: 'anywhere' }}>{item.name}</span>
      )}

      {item.note && (
        <span
          title={item.note}
          style={{
            fontSize: 12,
            color: MUTED,
            maxWidth: 320,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.note}
        </span>
      )}
    </div>
  );
}

function CurrentPrice({ item, align = 'right' }: { item: WatchlistItem; align?: 'left' | 'right' }) {
  if (item.current_price === null) {
    return (
      <span
        style={{ display: 'inline-flex', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
        title="Pro tento titul se nepodařilo získat cenu. Zkus „Aktualizovat ceny“."
      >
        <Tag>Cena chybí</Tag>
      </span>
    );
  }
  return <span style={{ color: '#fff' }}>{money(item.current_price, item.currency)}</span>;
}

/**
 * Positive: the price is still above the entry. Zero or less: the condition
 * has occurred. Gold marks that, not green — this is not a gain, it is a
 * question waiting for an answer.
 */
function Distance({ item }: { item: WatchlistItem }) {
  const value = item.distance_to_target_pct;
  if (value === null) return <span style={{ color: MUTED }}>{MISSING}</span>;

  const reached = value <= 0;
  return (
    <span
      style={{ color: reached ? GOLD : '#fff', fontWeight: reached ? 700 : 400 }}
      title={
        reached
          ? 'Cena je na cílové úrovni nebo pod ní.'
          : 'O tolik procent je cena nad cílovou — tolik musí ještě klesnout.'
      }
    >
      {percent(value, 2, { withSign: true })}
    </span>
  );
}

function ChangeSinceAdded({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: MUTED }}>{MISSING}</span>;
  const tone = toneFor(value);
  const arrow = arrowFor(value);
  return (
    <span style={{ color: TONE_COLOR_ON_DARK[tone], whiteSpace: 'nowrap' }}>
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {percent(value, 2, { withSign: true })}
    </span>
  );
}

// --- Actions ---------------------------------------------------------------

function RowActions({
  item,
  onBuy,
  onEdit,
  onDelete,
  align,
}: {
  item: WatchlistItem;
  onBuy: (item: WatchlistItem) => void;
  onEdit: (item: WatchlistItem) => void;
  onDelete: (item: WatchlistItem) => void;
  align: 'flex-start' | 'flex-end';
}) {
  const archived = item.archived_at !== null;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: align }}>
      {!archived && (
        <Button size="sm" onClick={() => onBuy(item)}>
          Koupil jsem
        </Button>
      )}
      {!archived && (
        <Button size="sm" variant="outline-dark" onClick={() => onEdit(item)}>
          Upravit
        </Button>
      )}
      <Button
        size="sm"
        variant="outline-dark"
        onClick={() => onDelete(item)}
        style={{ borderColor: 'rgba(255,255,255,0.35)', color: 'var(--on-dark-mute)' }}
      >
        Smazat
      </Button>
    </div>
  );
}

// --- Narrow sort control ---------------------------------------------------

function NarrowSortBar({ sort, onSort }: { sort: SortState; onSort: (key: SortKey) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Řadit podle
      </span>
      {COLUMNS.map((column) => {
        const active = sort.key === column.key;
        return (
          <button
            key={column.key}
            type="button"
            onClick={() => onSort(column.key)}
            style={{
              border: `1px solid ${active ? GOLD : HAIRLINE}`,
              background: active ? 'rgba(220,180,92,0.12)' : 'transparent',
              color: active ? GOLD : MUTED,
              borderRadius: 'var(--radius-full)',
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {column.shortLabel}
            {active && <span aria-hidden="true"> {sort.direction === 1 ? '↑' : '↓'}</span>}
          </button>
        );
      })}
    </div>
  );
}
