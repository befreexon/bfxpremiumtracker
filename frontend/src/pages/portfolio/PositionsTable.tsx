/**
 * The positions table — the content of this layer, not decoration around a
 * chart. Every column sorts, the default is gain in CZK descending, and a row
 * opens into the full detail.
 *
 * Below 860 px the same data becomes a list: instrument and value on the left,
 * gain on the right, everything else one tap away.
 */

import { Fragment, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Position } from '../../api/types';
import { Button, Tag } from '../../design/components';
import {
  arrowFor,
  czk,
  daysLabel,
  dateTime,
  money,
  MISSING,
  percent,
  quantity as formatQuantity,
  share,
  toneFor,
  TONE_COLOR_ON_DARK,
} from '../../lib/format';
import { CAPTION, EYEBROW, TABLE, TAX_COLOR, TD, TD_NUM, TH, TH_NUM, errorText, instrumentKey } from './theme';

type SortKey =
  | 'instrument'
  | 'quantity'
  | 'average_price'
  | 'current_price'
  | 'value'
  | 'gain'
  | 'gain_pct'
  | 'weight'
  | 'tax';

type Direction = 'asc' | 'desc';

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
  /** First click on a fresh column sorts this way. */
  initial: Direction;
}

const COLUMNS: Column[] = [
  { key: 'instrument', label: 'Instrument', numeric: false, initial: 'asc' },
  { key: 'quantity', label: 'Množství', numeric: true, initial: 'desc' },
  { key: 'average_price', label: 'Prům. cena', numeric: true, initial: 'desc' },
  { key: 'current_price', label: 'Aktuální cena', numeric: true, initial: 'desc' },
  { key: 'value', label: 'Hodnota Kč', numeric: true, initial: 'desc' },
  { key: 'gain', label: 'Zisk Kč', numeric: true, initial: 'desc' },
  { key: 'gain_pct', label: 'Zisk %', numeric: true, initial: 'desc' },
  { key: 'weight', label: 'Podíl', numeric: true, initial: 'desc' },
  { key: 'tax', label: 'Časový test', numeric: false, initial: 'asc' },
];

/** Days until the nearest lot becomes exempt; negative when one already is. */
function nearestTaxDays(position: Position): number | null {
  const values = position.lots
    .map((lot) => lot.tax_test_days_remaining)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.min(...values);
}

function sortValue(position: Position, key: SortKey): number | null {
  switch (key) {
    case 'quantity':
      return position.quantity;
    case 'average_price':
      return position.average_price;
    case 'current_price':
      return position.current_price;
    case 'value':
      return position.value_czk;
    case 'gain':
      return position.total_gain_czk;
    case 'gain_pct':
      return position.total_gain_pct;
    case 'weight':
      return position.weight;
    case 'tax':
      return nearestTaxDays(position);
    default:
      return null;
  }
}

function sortPositions(positions: Position[], key: SortKey, direction: Direction): Position[] {
  const copy = [...positions];
  copy.sort((a, b) => {
    if (key === 'instrument') {
      const result = a.ticker.localeCompare(b.ticker, 'cs');
      return direction === 'asc' ? result : -result;
    }
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    // Anything the app could not compute sorts last, whichever way the column runs.
    if (left === null && right === null) return a.ticker.localeCompare(b.ticker, 'cs');
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return a.ticker.localeCompare(b.ticker, 'cs');
    return direction === 'asc' ? left - right : right - left;
  });
  return copy;
}

function taxSummary(position: Position): { text: string; status: Position['lots'][number]['tax_test_status'] } {
  if (position.lots.length === 0) return { text: MISSING, status: 'unknown' };
  const passed = position.lots.filter((lot) => lot.tax_test_status === 'passed').length;
  if (passed === position.lots.length) return { text: 'Splněno', status: 'passed' };
  const pending = position.lots.filter((lot) => lot.tax_test_status !== 'passed');
  const nearest = pending
    .map((lot) => lot.tax_test_days_remaining)
    .filter((value): value is number => value !== null)
    .reduce<number | null>((best, value) => (best === null || value < best ? value : best), null);
  const worst = pending.reduce(
    (acc, lot) => (acc === 'far' || lot.tax_test_status === 'far' ? 'far' : lot.tax_test_status),
    pending[0].tax_test_status,
  );
  const label = nearest === null ? MISSING : daysLabel(nearest);
  return { text: passed > 0 ? `${passed}/${position.lots.length} · ${label}` : label, status: worst };
}

function TaxCell({ position }: { position: Position }) {
  const summary = taxSummary(position);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          flexShrink: 0,
          borderRadius: summary.status === 'passed' ? 'var(--radius-full)' : 2,
          background: TAX_COLOR[summary.status],
          display: 'inline-block',
        }}
      />
      {summary.text}
    </span>
  );
}

function GainCell({ value, style }: { value: number | null; style?: CSSProperties }) {
  const tone = toneFor(value);
  const arrow = arrowFor(value);
  return (
    <span style={{ color: TONE_COLOR_ON_DARK[tone], whiteSpace: 'nowrap', ...style }}>
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {value !== null && value > 0 ? '+' : ''}
      {czk(value)}
    </span>
  );
}

const EDIT_INPUT: CSSProperties = {
  width: 110,
  height: 34,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--hairline-dark)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--on-dark)',
  padding: '0 10px',
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  outline: 'none',
};

function PriceEditor({
  position,
  onSave,
  onClear,
  onDone,
}: {
  position: Position;
  onSave: (price: number) => Promise<void>;
  onClear: () => Promise<void>;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(position.current_price === null ? '' : String(position.current_price));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    const value = Number(draft.replace(/\s| /g, '').replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Zadej cenu jako kladné číslo, například 128,40.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      onDone();
    } catch (err) {
      setError(errorText(err, `Cenu pro ${position.ticker} se nepodařilo uložit. Zkus to znovu.`));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await onClear();
      onDone();
    } catch (err) {
      setError(errorText(err, `Ruční cenu pro ${position.ticker} se nepodařilo zrušit. Zkus to znovu.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}
      onClick={(event) => event.stopPropagation()}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit();
            if (event.key === 'Escape') onDone();
          }}
          style={EDIT_INPUT}
          aria-label={`Ruční cena pro ${position.ticker} v ${position.currency}`}
          placeholder={position.currency}
        />
        <Button variant="primary" size="sm" onClick={() => void commit()} disabled={busy}>
          Uložit
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="bfx-link" onClick={onDone} disabled={busy}>
          Zrušit
        </button>
        {position.price_is_manual && (
          <button className="bfx-link bfx-link-danger" onClick={() => void clear()} disabled={busy}>
            Vymazat ruční cenu
          </button>
        )}
      </div>
      {error && (
        <span role="alert" style={{ fontSize: 12, color: 'var(--loss-on-dark)', textAlign: 'right', maxWidth: 220 }}>
          {error}
        </span>
      )}
    </div>
  );
}

function PriceDisplay({ position, onEdit }: { position: Position; onEdit: () => void }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <button
        className="bfx-link"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        title={position.price_is_manual ? 'Ruční cena — klikni pro úpravu' : 'Zadat cenu ručně'}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {position.missing_price ? (
          <Tag>Cena chybí</Tag>
        ) : (
          <>
            {money(position.current_price, position.currency)}
            {position.price_is_manual && (
              <span aria-label="ruční cena" title="Ruční cena" style={{ marginLeft: 5, color: 'var(--gold)' }}>
                ✎
              </span>
            )}
          </>
        )}
      </button>
      {position.price_as_of && !position.missing_price && (
        <span style={{ fontSize: 11, color: 'var(--on-dark-mute)' }}>{dateTime(position.price_as_of)}</span>
      )}
    </span>
  );
}

interface PositionsTableProps {
  positions: Position[];
  narrow: boolean;
  expandedKey: string | null;
  onToggle: (key: string) => void;
  onSetManualPrice: (key: string, price: number) => Promise<void>;
  onClearManualPrice: (key: string) => Promise<void>;
  renderDetail: (position: Position) => ReactNode;
}

export function PositionsTable({
  positions,
  narrow,
  expandedKey,
  onToggle,
  onSetManualPrice,
  onClearManualPrice,
  renderDetail,
}: PositionsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({
    key: 'gain',
    direction: 'desc',
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const sorted = useMemo(
    () => sortPositions(positions, sort.key, sort.direction),
    [positions, sort.key, sort.direction],
  );

  const toggleSort = (column: Column) => {
    setSort((current) =>
      current.key === column.key
        ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: column.initial },
    );
  };

  const indicator = (column: Column) =>
    sort.key === column.key ? (sort.direction === 'asc' ? '▲' : '▼') : '';

  if (narrow) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ ...EYEBROW, alignSelf: 'center', marginRight: 4 }}>Seřadit</span>
          {COLUMNS.filter((column) => column.key !== 'instrument').map((column) => (
            <button
              key={column.key}
              className="bfx-chip"
              aria-pressed={sort.key === column.key}
              onClick={() => toggleSort(column)}
              style={{
                borderColor: sort.key === column.key ? 'var(--gold)' : 'var(--hairline-dark)',
                color: sort.key === column.key ? 'var(--gold)' : 'var(--on-dark-mute)',
              }}
            >
              {column.label} {indicator(column)}
            </button>
          ))}
        </div>

        {sorted.map((position) => {
          const key = instrumentKey(position);
          const open = expandedKey === key;
          return (
            <div
              key={key}
              style={{
                border: '1px solid var(--hairline-dark)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-deep)',
                opacity: position.missing_price ? 0.85 : 1,
              }}
            >
              <div
                className="bfx-row"
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => onToggle(key)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onToggle(key);
                  }
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--on-dark)' }}>
                    {position.ticker}
                    {position.missing_price && (
                      <span style={{ marginLeft: 8 }}>
                        <Tag>Cena chybí</Tag>
                      </span>
                    )}
                  </div>
                  <div style={{ ...CAPTION, fontSize: 12, marginTop: 2 }}>
                    {position.name || position.exchange} · {position.currency}
                  </div>
                  <div style={{ marginTop: 6, fontVariantNumeric: 'tabular-nums', color: 'var(--on-dark)' }}>
                    {czk(position.value_czk)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <GainCell value={position.total_gain_czk} style={{ fontWeight: 600 }} />
                  <div
                    style={{
                      fontSize: 13,
                      marginTop: 4,
                      fontVariantNumeric: 'tabular-nums',
                      color: TONE_COLOR_ON_DARK[toneFor(position.total_gain_pct)],
                    }}
                  >
                    {percent(position.total_gain_pct, 2, { withSign: true })}
                  </div>
                  <div style={{ ...CAPTION, fontSize: 11, marginTop: 6 }}>{open ? 'Zavřít ▲' : 'Detail ▼'}</div>
                </div>
              </div>

              {open && (
                <div style={{ padding: '0 16px 16px' }}>
                  <dl
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '10px 14px',
                      margin: '0 0 16px',
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <dt style={EYEBROW}>Množství</dt>
                      <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {formatQuantity(position.quantity)}
                      </dd>
                    </div>
                    <div>
                      <dt style={EYEBROW}>Prům. cena</dt>
                      <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {money(position.average_price, position.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt style={EYEBROW}>Aktuální cena</dt>
                      <dd style={{ margin: 0 }}>
                        {editingKey === key ? (
                          <PriceEditor
                            position={position}
                            onSave={(price) => onSetManualPrice(key, price)}
                            onClear={() => onClearManualPrice(key)}
                            onDone={() => setEditingKey(null)}
                          />
                        ) : (
                          <PriceDisplay position={position} onEdit={() => setEditingKey(key)} />
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt style={EYEBROW}>Podíl</dt>
                      <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{share(position.weight)}</dd>
                    </div>
                    <div>
                      <dt style={EYEBROW}>Časový test</dt>
                      <dd style={{ margin: 0 }}>
                        <TaxCell position={position} />
                      </dd>
                    </div>
                  </dl>
                  {renderDetail(position)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bfx-scroll">
      <table style={TABLE}>
        <caption className="bfx-visually-hidden">
          Pozice v portfoliu. Kliknutím na záhlaví sloupce se mění řazení, kliknutím na řádek se
          otevře detail.
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                style={column.numeric ? TH_NUM : TH}
                aria-sort={
                  sort.key === column.key
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <button
                  className="bfx-sort"
                  onClick={() => toggleSort(column)}
                  style={{ flexDirection: column.numeric ? 'row-reverse' : 'row' }}
                >
                  <span aria-hidden="true" style={{ width: 9, color: 'var(--gold)' }}>
                    {indicator(column)}
                  </span>
                  {column.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((position) => {
            const key = instrumentKey(position);
            const open = expandedKey === key;
            const dimmed = position.missing_price;
            return (
              <Fragment key={key}>
                <tr
                  className="bfx-row"
                  tabIndex={0}
                  aria-expanded={open}
                  onClick={() => onToggle(key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onToggle(key);
                    }
                  }}
                  style={{
                    background: open ? 'rgba(220,180,92,0.06)' : undefined,
                    color: dimmed ? 'var(--stone)' : undefined,
                  }}
                >
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span aria-hidden="true" style={{ color: 'var(--gold)', width: 10, fontSize: 10 }}>
                        {open ? '▾' : '▸'}
                      </span>
                      <span>
                        <span style={{ fontWeight: 700, color: dimmed ? 'var(--stone)' : 'var(--on-dark)' }}>
                          {position.ticker}
                        </span>
                        <span style={{ ...CAPTION, fontSize: 12, display: 'block' }}>
                          {position.name || position.exchange} · {position.currency}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td style={TD_NUM}>{formatQuantity(position.quantity)}</td>
                  <td style={TD_NUM}>{money(position.average_price, position.currency)}</td>
                  <td style={TD_NUM}>
                    {editingKey === key ? (
                      <PriceEditor
                        position={position}
                        onSave={(price) => onSetManualPrice(key, price)}
                        onClear={() => onClearManualPrice(key)}
                        onDone={() => setEditingKey(null)}
                      />
                    ) : (
                      <PriceDisplay position={position} onEdit={() => setEditingKey(key)} />
                    )}
                  </td>
                  <td style={TD_NUM}>{czk(position.value_czk)}</td>
                  <td style={{ ...TD_NUM, fontWeight: 600 }}>
                    <GainCell value={position.total_gain_czk} />
                  </td>
                  <td style={{ ...TD_NUM, color: TONE_COLOR_ON_DARK[toneFor(position.total_gain_pct)] }}>
                    {percent(position.total_gain_pct, 2, { withSign: true })}
                  </td>
                  <td style={TD_NUM}>{share(position.weight)}</td>
                  <td style={TD}>
                    <TaxCell position={position} />
                  </td>
                </tr>
                {open && (
                  <tr key={`${key}-detail`}>
                    <td colSpan={COLUMNS.length} style={{ padding: '4px 12px 22px', borderBottom: '1px solid var(--hairline-dark)' }}>
                      {renderDetail(position)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
