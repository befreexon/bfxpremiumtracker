/**
 * Financial goals: a named target value and date, measured against net
 * worth. The required annual return is solved from today's number and the
 * time actually left — not a canned estimate — and disappears once the goal
 * is already met.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { goals as goalsApi } from '../../api/client';
import type { Goal } from '../../api/types';
import { Button } from '../../design/components';
import { czk, date as formatDate, percent } from '../../lib/format';
import { DARK, Meter, Panel } from '../ai/primitives';

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

export function Goals() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => goalsApi.list().then(setGoals);

  useEffect(() => {
    load().catch((err) => setError(errorText(err, 'Cíle se nepodařilo načíst.')));
  }, []);

  const add = async () => {
    const parsed = Number(target.replace(',', '.'));
    if (!name.trim() || !Number.isFinite(parsed) || parsed <= 0 || !targetDate) return;
    setSaving(true);
    setError(null);
    try {
      await goalsApi.create({ name: name.trim(), target_value_czk: parsed, target_date: targetDate });
      setName('');
      setTarget('');
      setTargetDate('');
      await load();
    } catch (err) {
      setError(errorText(err, 'Cíl se nepodařilo přidat.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (goal: Goal) => {
    setError(null);
    try {
      await goalsApi.remove(goal.id);
      await load();
    } catch (err) {
      setError(errorText(err, 'Cíl se nepodařilo smazat.'));
    }
  };

  return (
    <Panel
      title="Finanční cíle"
      subtitle="Cílová hodnota a datum, měřeno proti celkovému čistému jmění. Potřebný roční výnos se počítá z dnešní hodnoty a zbývajícího času — ne z odhadu."
    >
      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Název, například Důchod"
          style={{ ...CONTROL_STYLE, flex: '1 1 200px' }}
        />
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="Cílová hodnota v Kč"
          inputMode="decimal"
          style={{ ...CONTROL_STYLE, width: 170, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
        />
        <input
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          style={{ ...CONTROL_STYLE, colorScheme: 'dark' }}
        />
        <Button size="sm" onClick={() => void add()} disabled={saving || !name.trim() || !target.trim() || !targetDate}>
          Přidat cíl
        </Button>
      </div>

      {goals && goals.length === 0 && <p style={{ fontSize: 13, color: DARK.faint }}>Zatím žádný cíl.</p>}

      {goals && goals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {goals.map((goal) => (
            <div key={goal.id} style={{ borderBottom: `1px solid ${DARK.divider}`, paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{goal.name}</div>
                  <div style={{ fontSize: 12, color: DARK.faint, marginTop: 2 }}>
                    {czk(goal.current_value_czk)} z {czk(goal.target_value_czk)} do {formatDate(goal.target_date)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: goal.reached ? 'var(--gain-on-dark)' : DARK.text }}>
                    {goal.reached ? 'Cíl splněn' : percent(goal.progress_pct, 0)}
                  </div>
                  {!goal.reached && goal.required_annual_return_pct !== null && (
                    <div style={{ fontSize: 12, color: DARK.faint, marginTop: 2 }}>
                      potřebný výnos {percent(goal.required_annual_return_pct, 1)} ročně
                    </div>
                  )}
                  {!goal.reached && goal.required_annual_return_pct === null && (
                    <div style={{ fontSize: 12, color: 'var(--loss-on-dark)', marginTop: 2 }}>
                      termín už uplynul
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Meter value={Math.min(goal.progress_pct, 100)} color={goal.reached ? 'var(--gain-on-dark)' : DARK.gold} />
              </div>
              <button
                type="button"
                onClick={() => void remove(goal)}
                className="bfx-link bfx-link-danger"
                style={{ fontSize: 12, marginTop: 8 }}
              >
                Smazat
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
