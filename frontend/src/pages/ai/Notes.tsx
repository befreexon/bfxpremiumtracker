/**
 * Free-text notes about one instrument, kept next to its AI analýza. This is
 * the user's own thinking, not part of the analysis — it never feeds back
 * into the score or the narrative, and it never leaves this account.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { notes as notesApi } from '../../api/client';
import type { Note } from '../../api/types';
import { Button } from '../../design/components';
import { dateTime } from '../../lib/format';
import { DARK, Panel } from './primitives';

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const TEXTAREA_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: 'var(--radius-md)',
  border: `1px solid ${DARK.hairline}`,
  background: DARK.raised,
  color: DARK.text,
  padding: '10px 14px',
  fontSize: 15,
  fontFamily: 'var(--font-body)',
  outline: 'none',
  resize: 'vertical',
};

export function Notes({ symbol }: { symbol: string }) {
  const [items, setItems] = useState<Note[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(null);
    notesApi
      .list(symbol)
      .then(setItems)
      .catch((err) => setError(errorText(err, 'Poznámky se nepodařilo načíst.')));
  }, [symbol]);

  const reload = () => notesApi.list(symbol).then(setItems);

  const add = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await notesApi.create(symbol, trimmed);
      setText('');
      await reload();
    } catch (err) {
      setError(errorText(err, 'Poznámku se nepodařilo uložit.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setError(null);
    try {
      await notesApi.remove(id);
      await reload();
    } catch (err) {
      setError(errorText(err, 'Poznámku se nepodařilo smazat.'));
    }
  };

  return (
    <Panel title="Poznámky" subtitle={`Vlastní postřehy k ${symbol} — ukládají se jen tobě, do analýzy se nepromítají.`}>
      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Napiš si poznámku…"
          rows={2}
          style={TEXTAREA_STYLE}
        />
        <Button size="sm" onClick={() => void add()} disabled={saving || !text.trim()}>
          Přidat
        </Button>
      </div>

      {items && items.length === 0 && (
        <p style={{ fontSize: 13, color: DARK.faint, marginTop: 14 }}>Zatím žádná poznámka.</p>
      )}

      {items && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
          {items.map((note) => (
            <div key={note.id} style={{ borderBottom: `1px solid ${DARK.divider}`, paddingBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: DARK.faint }}>{dateTime(note.created_at)}</span>
                <button
                  type="button"
                  onClick={() => void remove(note.id)}
                  style={{ background: 'none', border: 'none', color: DARK.faint, cursor: 'pointer', fontSize: 12, padding: 0 }}
                >
                  Smazat
                </button>
              </div>
              <div style={{ fontSize: 14, color: DARK.text, marginTop: 4, whiteSpace: 'pre-wrap' }}>{note.text}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
