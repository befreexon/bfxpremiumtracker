/**
 * The price series and what is derived from it alone.
 *
 * SMA50 and SMA200 arrive as single latest values, not series, so they are drawn
 * as reference lines — which is also the honest reading: the question is where
 * the price sits relative to them today.
 */

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MISSING, TONE_COLOR_ON_DARK, arrowFor, date as formatDate, percent, toneFor } from '../../lib/format';
import { priceText, signedPercentText } from './formatting';
import { DARK, Eyebrow, Panel, StatTile } from './primitives';
import type { Technicals } from '../../api/types';

const SMA50_COLOR = '#8fb8d8';
const SMA200_COLOR = '#c9a0d0';

function ReturnTile({ label, value }: { label: string; value: number | null }) {
  const tone = toneFor(value);
  return (
    <StatTile
      label={label}
      value={value === null ? MISSING : `${arrowFor(value)} ${signedPercentText(value)}`}
      color={value === null ? DARK.mute : TONE_COLOR_ON_DARK[tone]}
      minWidth={118}
    />
  );
}

function Legend({ technicals, currency }: { technicals: Technicals; currency: string | null }) {
  const entries: { color: string; label: string }[] = [
    { color: DARK.gold, label: 'Zavírací cena' },
  ];
  if (technicals.sma50 !== null) {
    entries.push({ color: SMA50_COLOR, label: `SMA50 ${priceText(technicals.sma50, currency)}` });
  }
  if (technicals.sma200 !== null) {
    entries.push({ color: SMA200_COLOR, label: `SMA200 ${priceText(technicals.sma200, currency)}` });
  }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
      {entries.map((entry) => (
        <span key={entry.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: DARK.mute }}>
          <span style={{ width: 14, height: 2, background: entry.color, borderRadius: 1 }} />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

export function PriceChart({ technicals, currency }: { technicals: Technicals; currency: string | null }) {
  const points = technicals.points;

  if (points.length === 0) {
    return (
      <Panel title="Vývoj ceny">
        <div style={{ fontSize: 14, color: DARK.mute }}>
          Historie cen je prázdná, graf proto není co vykreslit.
        </div>
      </Panel>
    );
  }

  const closes = points.map((point) => point.close);
  const candidates = [...closes, technicals.sma50, technicals.sma200].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const low = Math.min(...candidates);
  const high = Math.max(...candidates);
  const pad = (high - low) * 0.06 || Math.abs(high) * 0.02 || 1;

  const rsi = technicals.rsi14;
  const rsiNote =
    rsi === null ? 'nelze spočítat' : rsi >= 70 ? 'překoupeno' : rsi <= 30 ? 'přeprodáno' : 'neutrální pásmo';

  return (
    <Panel
      title="Vývoj ceny"
      subtitle={`${formatDate(technicals.first_date)} – ${formatDate(technicals.last_date)} · ${technicals.observations} obchodních dní. Klouzavé průměry jsou poslední hodnoty, proto jsou vodorovné.`}
    >
      <Legend technicals={technicals} currency={currency} />

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 320, height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                minTickGap={48}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) =>
                  new Date(String(value)).toLocaleDateString('cs-CZ', { month: 'numeric', year: '2-digit' })
                }
              />
              <YAxis
                domain={[low - pad, high + pad]}
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(value) => Number(value).toFixed(0)}
              />
              <Tooltip
                contentStyle={{
                  background: '#1f2019',
                  border: '1px solid rgba(255,255,255,0.16)',
                  borderRadius: 10,
                  color: '#fff',
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                labelFormatter={(value) => formatDate(String(value))}
                formatter={(value) => [priceText(Number(value), currency), 'Zavírací cena']}
              />
              {technicals.sma50 !== null && (
                <ReferenceLine y={technicals.sma50} stroke={SMA50_COLOR} strokeDasharray="5 4" strokeWidth={1} />
              )}
              {technicals.sma200 !== null && (
                <ReferenceLine y={technicals.sma200} stroke={SMA200_COLOR} strokeDasharray="2 4" strokeWidth={1} />
              )}
              <Line type="monotone" dataKey="close" stroke={DARK.gold} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <Eyebrow>Technické ukazatele</Eyebrow>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <StatTile label="Klouzavé průměry" value={technicals.cross_state_cs} minWidth={220} />
          <StatTile
            label="RSI(14)"
            value={rsi === null ? MISSING : rsi.toFixed(1).replace('.', ',')}
            sub={rsiNote}
          />
          <StatTile
            label="Roční volatilita"
            value={percent(technicals.volatility_annual_pct, 1)}
            sub="ze směrodatné odchylky denních výnosů"
            minWidth={180}
          />
          <StatTile
            label="Max. pokles v okně"
            value={
              technicals.max_drawdown_pct === null
                ? MISSING
                : `${arrowFor(technicals.max_drawdown_pct)} ${percent(technicals.max_drawdown_pct, 1)}`
            }
            color={technicals.max_drawdown_pct === null ? DARK.mute : TONE_COLOR_ON_DARK.loss}
            sub="od vrcholu ke dnu"
            minWidth={180}
          />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Eyebrow>Výnosy ceny</Eyebrow>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <ReturnTile label="1 měsíc" value={technicals.return_1m_pct} />
          <ReturnTile label="3 měsíce" value={technicals.return_3m_pct} />
          <ReturnTile label="6 měsíců" value={technicals.return_6m_pct} />
          <ReturnTile label="1 rok" value={technicals.return_1y_pct} />
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: DARK.faint }}>
          Výnosy se počítají v obchodních dnech (21 / 63 / 126 / 252 barů zpět), ne v kalendářních.
          Řada je stažená s automatickou úpravou o splity a dividendy.
        </p>
      </div>
    </Panel>
  );
}
