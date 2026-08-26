/**
 * Target-allocation rebalancing. The user sets what share of the portfolio
 * each asset class should be; this panel turns the gap between that and
 * today's actual split into a buy/sell amount per class. The targets are
 * entirely the user's own numbers — nothing here suggests what they should be.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { rebalance as rebalanceApi } from '../../api/client';
import type { AssetClass, RebalanceSuggestion } from '../../api/types';
import { Button } from '../../design/components';
import { NUMERIC_STYLE, TONE_COLOR_ON_DARK, czk, percent, toneFor } from '../../lib/format';
import { ASSET_CLASS_LABEL, CAPTION, PANEL, SECTION_TITLE, errorText } from './theme';

const CLASSES = Object.keys(ASSET_CLASS_LABEL) as AssetClass[];

const CONTROL_STYLE: CSSProperties = {
  height: 34,
  width: 90,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--hairline-dark)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--on-dark)',
  padding: '0 10px',
  fontSize: 14,
  outline: 'none',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

export function Rebalance({ scopeIds }: { scopeIds: number[] | undefined }) {
  const [draft, setDraft] = useState<Record<AssetClass, string>>({ STOCK: '', ETF: '', CRYPTO: '' });
  const [suggestions, setSuggestions] = useState<RebalanceSuggestion[] | null>(null);
  const [targetsSum, setTargetsSum] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [targets, result] = await Promise.all([rebalanceApi.getTargets(), rebalanceApi.get(scopeIds)]);
    setDraft({
      STOCK: targets.STOCK !== undefined ? String(targets.STOCK) : '',
      ETF: targets.ETF !== undefined ? String(targets.ETF) : '',
      CRYPTO: targets.CRYPTO !== undefined ? String(targets.CRYPTO) : '',
    });
    setSuggestions(result.suggestions);
    setTargetsSum(result.targets_sum_pct);
  };

  useEffect(() => {
    load().catch((err) => setError(errorText(err, 'Cíle se nepodařilo načíst.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeIds]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const targets: Record<string, number> = {};
      for (const cls of CLASSES) {
        const trimmed = draft[cls].trim();
        if (trimmed) targets[cls] = Number(trimmed);
      }
      await rebalanceApi.setTargets(targets);
      await load();
    } catch (err) {
      setError(errorText(err, 'Cíle se nepodařilo uložit.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Rebalancování</h3>
      <p style={{ ...CAPTION, marginTop: 6, maxWidth: 620 }}>
        Nastav, kolik procent portfolia má tvořit každá třída aktiv. Podle dnešní hodnoty pak
        spočítáme, kolik dokoupit nebo prodat, aby se tomu portfolio přiblížilo.
      </p>

      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginTop: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 16, alignItems: 'flex-end' }}>
        {CLASSES.map((cls) => (
          <label key={cls} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--on-dark-mute)' }}>{ASSET_CLASS_LABEL[cls]} (%)</span>
            <input
              value={draft[cls]}
              onChange={(event) => setDraft((prev) => ({ ...prev, [cls]: event.target.value }))}
              placeholder="0"
              inputMode="decimal"
              style={CONTROL_STYLE}
            />
          </label>
        ))}
        <Button size="sm" variant="outline-dark" onClick={() => void save()} disabled={saving}>
          {saving ? 'Ukládám…' : 'Uložit cíle'}
        </Button>
      </div>

      {targetsSum > 0 && Math.abs(targetsSum - 100) > 0.01 && (
        <p style={{ fontSize: 13, color: 'var(--accent-warning)', marginTop: 12 }}>
          Cíle dávají dohromady {percent(targetsSum, 1)}, ne 100 %. Návrhy níž s tím počítají tak,
          jak jsou zadané.
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {suggestions.map((row) => (
            <div key={row.asset_class} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, width: 90 }}>{ASSET_CLASS_LABEL[row.asset_class]}</span>
              <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', width: 130 }}>
                {percent(row.current_pct, 1)} → cíl {percent(row.target_pct, 1)}
              </span>
              <span style={{ fontSize: 13, width: 120, ...NUMERIC_STYLE }}>{czk(row.current_value_czk)}</span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  minWidth: 160,
                  ...NUMERIC_STYLE,
                  color: Math.abs(row.delta_czk) < 1 ? 'var(--on-dark-mute)' : TONE_COLOR_ON_DARK[toneFor(row.delta_czk)],
                }}
              >
                {Math.abs(row.delta_czk) < 1
                  ? 'V cíli'
                  : row.delta_czk > 0
                    ? `Dokoupit ${czk(row.delta_czk)}`
                    : `Prodat ${czk(-row.delta_czk)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
