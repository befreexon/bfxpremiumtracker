/**
 * "Dividendy" — trailing income (what was actually paid) alongside a forward
 * calendar (what the payment cadence projects next). The two halves are
 * deliberately different tenses: the top numbers are history, the calendar
 * below is a labelled estimate, never a company announcement.
 */

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DividendGrowth, Overview, UpcomingDividend } from '../../api/types';
import { NUMERIC_STYLE, TONE_COLOR_ON_DARK, arrowFor, czk, percent, toneFor } from '../../lib/format';
import { CAPTION, EYEBROW, PANEL, PANEL_INSET, SECTION_TITLE } from './theme';

const MONTH_NAMES = [
  'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
];

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const name = MONTH_NAMES[Number(month) - 1] ?? key;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function Dividends({ data }: { data: Overview }) {
  const hasHistory = data.trailing_12m_dividends_czk > 0;
  const hasForecast = data.upcoming_dividends.length > 0;
  const hasGrowthData = data.dividend_growth.length > 0;
  if (!hasHistory && !hasForecast && !hasGrowthData) return null;

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Dividendy</h3>

      {hasHistory && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 18, marginTop: 16 }}>
          <div>
            <div style={EYEBROW}>Výnos (12 měsíců)</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, marginTop: 4, ...NUMERIC_STYLE, textAlign: 'left' }}>
              {percent(data.dividend_yield_pct, 2)}
            </div>
            <div style={{ ...CAPTION, fontSize: 12, marginTop: 2 }}>
              {percent(data.dividend_yield_on_cost_pct, 2)} výnos z nákladů
            </div>
          </div>
          <div>
            <div style={EYEBROW}>Celkem za 12 měsíců</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, marginTop: 4, ...NUMERIC_STYLE, textAlign: 'left' }}>
              {czk(data.trailing_12m_dividends_czk)}
            </div>
            <div style={{ ...CAPTION, fontSize: 12, marginTop: 2 }}>
              {czk(data.trailing_12m_dividends_czk / 12)} měsíčně v průměru
            </div>
          </div>
        </div>
      )}

      {data.dividends_by_instrument.length > 0 && (
        <>
          <p style={{ ...CAPTION, marginTop: 24 }}>Dividendy podle titulu (posledních 12 měsíců)</p>
          <div style={{ height: 200, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dividends_by_instrument} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="ticker" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={78}
                  tickFormatter={(value) => czk(Number(value))}
                />
                <Tooltip
                  contentStyle={{ background: '#2d2f2c', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff' }}
                  formatter={(value) => czk(Number(value))}
                />
                <Bar dataKey="value_czk" fill="#6f9bc4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <DividendGrowthTable rows={data.dividend_growth} />

      <DividendCalendar items={data.upcoming_dividends} />
    </section>
  );
}

function DividendGrowthTable({ rows }: { rows: DividendGrowth[] }) {
  if (rows.length === 0) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <h4 style={{ ...SECTION_TITLE, fontSize: 15 }}>Meziroční růst dividend</h4>
      <p style={{ ...CAPTION, marginTop: 6 }}>
        Posledních 12 měsíců oproti 12 měsícům před tím, podle skutečně přijatých plateb. U titulu
        bez výplaty v předchozím období není k čemu srovnávat.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {rows.map((row) => (
          <div
            key={row.ticker}
            style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}
          >
            <span style={{ fontWeight: 600, width: 72 }}>{row.ticker}</span>
            <span style={{ color: 'var(--on-dark-mute)', minWidth: 100, ...NUMERIC_STYLE }}>
              {czk(row.trailing_12m_czk)}
            </span>
            <span style={{ color: 'var(--on-dark-mute)', fontSize: 13 }}>
              ({czk(row.prior_12m_czk)} předtím)
            </span>
            {row.growth_pct !== null ? (
              <span
                style={{
                  fontWeight: 600,
                  minWidth: 70,
                  ...NUMERIC_STYLE,
                  color: TONE_COLOR_ON_DARK[toneFor(row.growth_pct)],
                }}
              >
                {arrowFor(row.growth_pct)} {percent(row.growth_pct, 1, { withSign: true })}
              </span>
            ) : (
              <span style={{ ...CAPTION, fontSize: 12 }}>nová výplata, bez srovnání</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DividendCalendar({ items }: { items: UpcomingDividend[] }) {
  if (items.length === 0) return null;

  const byMonth = new Map<string, UpcomingDividend[]>();
  for (const item of items) {
    const month = item.expected_date.slice(0, 7);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(item);
    else byMonth.set(month, [item]);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  return (
    <div style={{ marginTop: 28 }}>
      <h4 style={{ ...SECTION_TITLE, fontSize: 15 }}>Kalendář dividend (příštích 12 měsíců)</h4>
      <p style={{ ...CAPTION, marginTop: 6 }}>
        Odhad z historické kadence výplat, ne oznámení společnosti — jen datum platby, protože
        historii dat rozhodných pro nárok neevidujeme.
      </p>
      <div style={{ display: 'grid', gap: 12, marginTop: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {months.map(([month, rows]) => {
          const total = rows.reduce((sum, row) => sum + (row.estimated_net_czk ?? 0), 0);
          return (
            <div key={month} style={PANEL_INSET}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{monthLabel(month)}</span>
                {total > 0 && (
                  <span style={{ fontSize: 13, ...NUMERIC_STYLE, color: 'var(--gain-on-dark)' }}>{czk(total)}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {rows
                  .sort((a, b) => (a.expected_date < b.expected_date ? -1 : 1))
                  .map((row) => (
                    <div
                      key={`${row.instrument_key}-${row.expected_date}`}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}
                    >
                      <span style={{ fontWeight: 600 }}>{row.ticker}</span>
                      <span style={{ color: 'var(--on-dark-mute)' }}>{row.expected_date.slice(8, 10)}.</span>
                      <span style={{ ...NUMERIC_STYLE, flex: 1 }}>{czk(row.estimated_net_czk)}</span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
