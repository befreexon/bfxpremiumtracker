/**
 * "Přehled transakcí" — every BUY/SELL/DIV/ADJUST across the current scope,
 * newest first. The positions table already groups by instrument; this is
 * the flat chronological feed underneath it, for "what did I actually do,
 * and when" rather than "what do I hold now".
 */

import { useEffect, useState } from 'react';
import { journal as journalApi } from '../../api/client';
import type { Transaction, TransactionType } from '../../api/types';
import { date as formatDate, money, quantity } from '../../lib/format';
import { CAPTION, PANEL, SECTION_TITLE, TYPE_LABEL, errorText } from './theme';

const TYPE_COLOR: Record<TransactionType, string> = {
  BUY: 'var(--gain-on-dark)',
  SELL: 'var(--loss-on-dark)',
  DIV: 'var(--gold)',
  ADJUST: 'var(--on-dark-mute)',
};

const JOURNAL_LIMIT = 100;

export function TransactionJournal({ scopeIds }: { scopeIds: number[] | undefined }) {
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    journalApi
      .list(scopeIds, JOURNAL_LIMIT)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Přehled transakcí se nepodařilo načíst.'));
      });
    return () => {
      cancelled = true;
    };
  }, [scopeIds]);

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Přehled transakcí</h3>
      <p style={{ ...CAPTION, marginTop: 6 }}>
        Chronologicky, nejnovější nahoře{rows && rows.length >= JOURNAL_LIMIT ? ` · posledních ${JOURNAL_LIMIT}` : ''}.
      </p>

      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginTop: 12 }}>{error}</div>}

      {rows && rows.length === 0 && (
        <p style={{ ...CAPTION, marginTop: 14 }}>Zatím žádná transakce.</p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14, maxHeight: 420, overflowY: 'auto' }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--divider-soft)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', width: 90, flexShrink: 0 }}>
                {formatDate(row.date)}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, width: 84, flexShrink: 0 }}>{row.ticker}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: TYPE_COLOR[row.type], width: 100, flexShrink: 0 }}>
                {TYPE_LABEL[row.type]}
              </span>
              <span style={{ fontSize: 14, ...({ fontVariantNumeric: 'tabular-nums' } as const), minWidth: 120 }}>
                {row.type === 'DIV' ? `${money(row.price, row.currency)} hrubého` : money(row.price, row.currency)}
              </span>
              <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', ...({ fontVariantNumeric: 'tabular-nums' } as const), minWidth: 90 }}>
                {row.type === 'ADJUST' ? `poměr ${quantity(row.quantity)}:1` : row.type === 'DIV' ? '' : `${quantity(row.quantity)} ks`}
              </span>
              {row.portfolio_name && (
                <span style={{ fontSize: 12, color: 'var(--on-dark-mute)', marginLeft: 'auto' }}>
                  {row.portfolio_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
