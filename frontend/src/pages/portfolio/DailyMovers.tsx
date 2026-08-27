/**
 * "Největší denní pohyby" — today's biggest gainers and losers among current
 * holdings, same day-change technique as the Trhy page. Always a live fetch
 * (one call per holding), so it's behind an explicit button rather than
 * loaded automatically with the rest of the page.
 */

import { useState } from 'react';
import { movers as moversApi } from '../../api/client';
import type { Mover } from '../../api/types';
import { Button } from '../../design/components';
import { NUMERIC_STYLE, TONE_COLOR_ON_DARK, arrowFor, czk, money, percent, toneFor } from '../../lib/format';
import { CAPTION, PANEL, SECTION_TITLE, errorText } from './theme';

export function DailyMovers({ scopeIds }: { scopeIds: number[] | undefined }) {
  const [movers, setMovers] = useState<Mover[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMovers(await moversApi.get(scopeIds));
    } catch (err) {
      setError(errorText(err, 'Dnešní pohyby se nepodařilo zjistit.'));
    } finally {
      setLoading(false);
    }
  };

  const usable = (movers ?? []).filter((mover) => mover.move_pct !== null);
  const unavailable = (movers ?? []).filter((mover) => mover.move_pct === null);
  const gainers = [...usable].filter((m) => (m.move_pct ?? 0) >= 0).sort((a, b) => (b.move_pct ?? 0) - (a.move_pct ?? 0));
  const losers = [...usable].filter((m) => (m.move_pct ?? 0) < 0).sort((a, b) => (a.move_pct ?? 0) - (b.move_pct ?? 0));

  return (
    <section style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={SECTION_TITLE}>Největší denní pohyby</h3>
          <p style={{ ...CAPTION, marginTop: 6, maxWidth: 560 }}>
            Dnešní cena proti včerejší závěrečné, pro aktuálně držené pozice. Živé dotazy jeden po
            druhém, proto na tlačítko — ne při každém otevření stránky.
          </p>
        </div>
        <Button size="sm" variant="outline-dark" onClick={() => void load()} disabled={loading}>
          {loading ? 'Zjišťuji…' : 'Zjistit dnešní pohyby'}
        </Button>
      </div>

      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginTop: 12 }}>{error}</div>}

      {movers && usable.length === 0 && !error && (
        <p style={{ ...CAPTION, marginTop: 14 }}>Dnešní pohyb se nepodařilo zjistit u žádné pozice.</p>
      )}

      {usable.length > 0 && (
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 16 }}>
          <MoverList title="Nejvíc nahoru" items={gainers} />
          <MoverList title="Nejvíc dolů" items={losers} />
        </div>
      )}

      {unavailable.length > 0 && (
        <p style={{ ...CAPTION, marginTop: 14 }}>
          Nedostupné: {unavailable.map((m) => m.ticker).join(', ')}.
        </p>
      )}
    </section>
  );
}

function MoverList({ title, items }: { title: string; items: Mover[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div style={{ ...CAPTION, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((mover) => (
          <div key={mover.instrument_key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, width: 72 }}>{mover.ticker}</span>
            <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', minWidth: 90, ...NUMERIC_STYLE }}>
              {mover.price !== null ? money(mover.price, mover.currency ?? '') : '—'}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                minWidth: 70,
                ...NUMERIC_STYLE,
                color: TONE_COLOR_ON_DARK[toneFor(mover.move_pct)],
              }}
            >
              {arrowFor(mover.move_pct)} {percent(mover.move_pct, 2, { withSign: true })}
            </span>
            {mover.move_czk !== null && (
              <span style={{ fontSize: 13, color: TONE_COLOR_ON_DARK[toneFor(mover.move_czk)], ...NUMERIC_STYLE }}>
                {mover.move_czk > 0 ? '+' : ''}
                {czk(mover.move_czk)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
