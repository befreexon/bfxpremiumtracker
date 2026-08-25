/**
 * "Vlastní rozdělení" — the user's own breakdown of the portfolio, alongside
 * the built-in ones by asset class, currency and instrument. A segment is a
 * named, coloured bucket the user creates themselves (e.g. "Jádro" vs
 * "Spekulace"); each instrument sits in at most one, so the picture stays a
 * clean partition rather than free-form tags.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { segments as segmentsApi } from '../../api/client';
import type { Overview, Segment } from '../../api/types';
import { Button } from '../../design/components';
import { NUMERIC_STYLE, czk, share } from '../../lib/format';
import { CAPTION, PANEL, SECTION_TITLE, errorText, instrumentKey } from './theme';

// Rotates through the same family of muted tones the instrument donut uses,
// so a user-picked segment still sits comfortably in the existing palette.
const SEGMENT_COLORS = [
  '#dcb45c', '#6f9bc4', '#7fbf8f', '#e3897f', '#b89bd6', '#e8c878', '#8fb0c9', '#a3d1ae',
];

const CONTROL_STYLE: CSSProperties = {
  height: 34,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--hairline-dark)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--on-dark)',
  padding: '0 10px',
  fontSize: 14,
  outline: 'none',
};

interface SegmentsProps {
  data: Overview;
  onChanged: () => void;
}

export function Segments({ data, onChanged }: SegmentsProps) {
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setSegments(await segmentsApi.list());
    } catch (err) {
      setError(errorText(err, 'Sekce se nepodařilo načíst.'));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createSegment = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const color = SEGMENT_COLORS[(segments?.length ?? 0) % SEGMENT_COLORS.length];
      await segmentsApi.create(trimmed, color);
      setName('');
      await load();
    } catch (err) {
      setError(errorText(err, 'Sekci se nepodařilo založit.'));
    } finally {
      setBusy(false);
    }
  };

  const removeSegment = async (id: number) => {
    setError(null);
    try {
      await segmentsApi.remove(id);
      await load();
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Sekci se nepodařilo smazat.'));
    }
  };

  const assign = async (key: string, segmentId: number | null) => {
    setError(null);
    try {
      await segmentsApi.assign(key, segmentId);
      await load();
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Přiřazení se nepodařilo uložit.'));
    }
  };

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Vlastní rozdělení</h3>
      <p style={{ ...CAPTION, marginTop: 6, maxWidth: 560 }}>
        Vlastní sekce napříč portfoliem — třeba „Jádro“ a „Spekulace“ — nezávislé na třídě
        aktiv nebo měně. Pozice bez přiřazení zůstává „Nezařazeno“.
      </p>

      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginTop: 12 }}>{error}</div>}

      {segments === null ? (
        <p style={{ ...CAPTION, marginTop: 14 }}>Načítám…</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
            {segments.map((segment) => (
              <span key={segment.id} className="bfx-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: segment.color, flexShrink: 0 }}
                />
                {segment.name}
                <button
                  type="button"
                  onClick={() => void removeSegment(segment.id)}
                  aria-label={`Smazat sekci ${segment.name}`}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, opacity: 0.6, lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createSegment();
              }}
              placeholder="Nová sekce…"
              style={{ ...CONTROL_STYLE, width: 140 }}
            />
            <Button size="sm" variant="outline-dark" onClick={() => void createSegment()} disabled={busy || !name.trim()}>
              + Přidat
            </Button>
          </div>

          {segments.length === 0 && (
            <p style={{ ...CAPTION, marginTop: 14 }}>Zatím žádná sekce. Založ první a přiřaď k ní pozice níž.</p>
          )}

          {segments.length > 0 && (
            <>
              {data.allocation_by_segment.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                  {data.allocation_by_segment.map((slice) => (
                    <div key={slice.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 'var(--radius-full)',
                          background: slice.color ?? 'var(--stone)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 14, width: 120 }}>{slice.label}</span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 'var(--radius-full)',
                          background: 'rgba(255,255,255,0.12)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${slice.weight * 100}%`,
                            height: '100%',
                            background: slice.color ?? 'var(--stone)',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', width: 58, ...NUMERIC_STYLE }}>
                        {share(slice.weight)}
                      </span>
                      <span style={{ fontSize: 13, width: 108, ...NUMERIC_STYLE }}>{czk(slice.value_czk)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                {data.positions.map((position) => {
                  const key = instrumentKey(position);
                  const current = segments.find((s) => s.member_instrument_keys.includes(key));
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 14, width: 140 }}>{position.ticker}</span>
                      <select
                        value={current?.id ?? ''}
                        onChange={(event) =>
                          void assign(key, event.target.value ? Number(event.target.value) : null)
                        }
                        style={{ ...CONTROL_STYLE, width: 170 }}
                      >
                        <option value="">Nezařazeno</option>
                        {segments.map((segment) => (
                          <option key={segment.id} value={segment.id}>
                            {segment.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
