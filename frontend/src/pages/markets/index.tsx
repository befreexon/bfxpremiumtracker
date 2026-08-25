/**
 * "Trhy" — a small, fixed set of index/commodity/crypto/FX quotes for
 * orientation. Not a trading terminal and not a replacement for the
 * portfolio's own numbers — just "what did the market do today."
 */

import { useEffect, useState } from 'react';
import { markets as marketsApi } from '../../api/client';
import type { MarketQuote } from '../../api/types';
import { arrowFor, money, percent, toneFor, TONE_COLOR_ON_DARK } from '../../lib/format';
import { DARK, Panel, StatTile } from '../ai/primitives';

export function MarketsLayer() {
  const [quotes, setQuotes] = useState<MarketQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    marketsApi
      .overview()
      .then(setQuotes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Trhy se nepodařilo načíst.'));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div style={{ fontSize: 13, color: DARK.mute, marginBottom: 6, letterSpacing: '0.08em' }}>TRHY</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '-0.5px', margin: 0 }}>
          Rychlý přehled
        </h1>
        <p style={{ color: DARK.mute, fontSize: 15, lineHeight: 1.6, margin: '8px 0 0', maxWidth: 720 }}>
          Pár hlavních indexů, komodit a měn pro rychlou orientaci — ne obchodní nástroj a ne
          náhrada za čísla z vlastního portfolia.
        </p>
      </div>

      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14 }}>{error}</div>}

      {quotes === null && !error && <p style={{ color: DARK.mute, fontSize: 15 }}>Načítám…</p>}

      {quotes && (
        <Panel
          title="Přehled trhu"
          subtitle="Best-effort z Yahoo Finance. Titul, u kterého se cenu nepodařilo dohledat, je vidět jako nedostupný, ne s vymyšleným číslem."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {quotes.map((quote) => (
              <StatTile
                key={quote.key}
                label={quote.label}
                value={quote.price === null ? '—' : money(quote.price, quote.currency ?? 'USD')}
                sub={
                  quote.price === null ? (
                    quote.error ?? 'Nedostupné'
                  ) : quote.change_pct === null ? (
                    'bez srovnání'
                  ) : (
                    <span style={{ color: TONE_COLOR_ON_DARK[toneFor(quote.change_pct)] }}>
                      {arrowFor(quote.change_pct)} {percent(quote.change_pct, 2, { withSign: true })}
                    </span>
                  )
                }
                minWidth={170}
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
