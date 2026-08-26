/**
 * "Čisté jmění" — securities (from the portfolio engine, across every
 * portfolio) plus manual assets: cash, real estate, anything else the user
 * values by hand. No live price, no FIFO, no tax test — just a number the
 * user types in and updates whenever they want.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { netWorth as netWorthApi } from '../../api/client';
import type { AssetCategory, ManualAsset, NetWorth } from '../../api/types';
import { Button } from '../../design/components';
import { czk, dateTime } from '../../lib/format';
import { DARK, Panel, StatTile } from '../ai/primitives';

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  CASH: 'Hotovost',
  REAL_ESTATE: 'Nemovitost',
  OTHER: 'Ostatní',
};

const CONTROL_STYLE: CSSProperties = {
  height: 40,
  borderRadius: 'var(--radius-md)',
  border: `1px solid ${DARK.hairline}`,
  background: DARK.raised,
  color: DARK.text,
  padding: '0 12px',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  outline: 'none',
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function NetWorthLayer() {
  const [data, setData] = useState<NetWorth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('CASH');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => netWorthApi.get().then(setData);

  useEffect(() => {
    load().catch((err) => setError(errorText(err, 'Čisté jmění se nepodařilo načíst.')));
  }, []);

  const add = async () => {
    const parsed = Number(value.replace(',', '.'));
    if (!name.trim() || !Number.isFinite(parsed) || parsed < 0) return;
    setSaving(true);
    setError(null);
    try {
      await netWorthApi.createAsset({ name: name.trim(), category, value_czk: parsed });
      setName('');
      setValue('');
      await load();
    } catch (err) {
      setError(errorText(err, 'Položku se nepodařilo přidat.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (asset: ManualAsset) => {
    setError(null);
    try {
      await netWorthApi.removeAsset(asset.id);
      await load();
    } catch (err) {
      setError(errorText(err, 'Položku se nepodařilo smazat.'));
    }
  };

  const revalue = async (asset: ManualAsset) => {
    const input = window.prompt(`Nová hodnota pro „${asset.name}“ (Kč)`, String(asset.value_czk));
    if (input === null) return;
    const parsed = Number(input.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setError(null);
    try {
      await netWorthApi.updateAsset(asset.id, { value_czk: parsed });
      await load();
    } catch (err) {
      setError(errorText(err, 'Položku se nepodařilo přecenit.'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div style={{ fontSize: 13, color: DARK.mute, marginBottom: 6, letterSpacing: '0.08em' }}>
          ČISTÉ JMĚNÍ
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '-0.5px', margin: 0 }}>
          Cenné papíry a ostatní majetek dohromady
        </h1>
        <p style={{ color: DARK.mute, fontSize: 15, lineHeight: 1.6, margin: '8px 0 0', maxWidth: 720 }}>
          Ostatní majetek (hotovost, nemovitosti, cokoli dalšího) nemá živou cenu ani daňový test —
          jen hodnotu, kterou si sám zapíšeš a podle potřeby přeceníš.
        </p>
      </div>

      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14 }}>{error}</div>}

      {data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <StatTile label="Cenné papíry" value={czk(data.securities_value_czk)} />
          <StatTile label="Ostatní majetek" value={czk(data.manual_assets_total_czk)} />
          <StatTile label="Čisté jmění" value={czk(data.net_worth_czk)} color={DARK.gold} />
        </div>
      )}

      <Panel title="Ostatní majetek">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Název, například Byt"
            style={{ ...CONTROL_STYLE, flex: '1 1 200px' }}
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as AssetCategory)}
            style={{ ...CONTROL_STYLE, cursor: 'pointer' }}
          >
            {(Object.keys(CATEGORY_LABEL) as AssetCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Hodnota v Kč"
            inputMode="decimal"
            style={{ ...CONTROL_STYLE, width: 140, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          />
          <Button size="sm" onClick={() => void add()} disabled={saving || !name.trim() || !value.trim()}>
            Přidat
          </Button>
        </div>

        {data && data.manual_assets.length === 0 && (
          <p style={{ fontSize: 13, color: DARK.faint }}>Zatím žádná položka.</p>
        )}

        {data && data.manual_assets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.manual_assets.map((asset) => (
              <div
                key={asset.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: `1px solid ${DARK.divider}`,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, flex: '1 1 160px' }}>{asset.name}</span>
                <span style={{ fontSize: 12, color: DARK.faint, width: 100 }}>{CATEGORY_LABEL[asset.category]}</span>
                <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', minWidth: 130, textAlign: 'right' }}>
                  {czk(asset.value_czk)}
                </span>
                <span style={{ fontSize: 12, color: DARK.faint, minWidth: 130 }}>
                  přeceněno {dateTime(asset.updated_at)}
                </span>
                <button type="button" onClick={() => void revalue(asset)} className="bfx-link" style={{ fontSize: 12 }}>
                  Přecenit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(asset)}
                  className="bfx-link bfx-link-danger"
                  style={{ fontSize: 12 }}
                >
                  Smazat
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
