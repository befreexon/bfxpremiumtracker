import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { snapshots as snapshotApi } from '../../api/client';
import type { AllocationSlice, BenchmarkComparison, Overview, Snapshot } from '../../api/types';
import { Button } from '../../design/components';
import { NUMERIC_STYLE, TONE_COLOR_ON_DARK, arrowFor, czk, date as formatDate, share, toneFor } from '../../lib/format';
import { Segments } from './Segments';
import { CAPTION, EYEBROW, PANEL, SECTION_TITLE, errorText } from './theme';
import { TransactionJournal } from './TransactionJournal';

interface InsightsProps {
  data: Overview;
  scopeIds: number[] | undefined;
  benchmarkTicker: string;
  onChanged: () => void;
}

export function Insights({ data, scopeIds, benchmarkTicker, onChanged }: InsightsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ValueChart scopeIds={scopeIds} />
      <BenchmarkLine scopeIds={scopeIds} fallbackTicker={benchmarkTicker} />
      <InstrumentDonut slices={data.allocation_by_instrument} />
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Allocation title="Podle třídy aktiv" slices={data.allocation_by_class} />
        <Allocation title="Podle měny" slices={data.allocation_by_currency} />
      </div>
      <Segments data={data} onChanged={onChanged} />
      <Concentration data={data} />
      <DividendCalendar data={data} />
      <TransactionJournal scopeIds={scopeIds} />
    </div>
  );
}

// Rotates through the palette rather than assigning a fixed brand colour per
// ticker — with an open-ended set of instruments there is no fixed mapping
// that stays meaningful, so the donut favours distinguishing slices instead.
const DONUT_COLORS = [
  '#dcb45c', '#6f9bc4', '#7fbf8f', '#e3897f', '#b89bd6',
  '#e8c878', '#8fb0c9', '#a3d1ae', '#eba99f', '#c9b3e0',
];

function InstrumentDonut({ slices }: { slices: AllocationSlice[] }) {
  if (slices.length === 0) return null;

  // Beyond a handful of slices a pie stops being readable — the smallest
  // instruments are folded into one "Ostatní" wedge instead of a ring of
  // slivers nobody can click.
  const MAX_SLICES = 7;
  const shown = slices.slice(0, MAX_SLICES);
  const rest = slices.slice(MAX_SLICES);
  const chartData =
    rest.length > 0
      ? [
          ...shown,
          {
            label: 'Ostatní',
            value_czk: rest.reduce((sum, s) => sum + s.value_czk, 0),
            weight: rest.reduce((sum, s) => sum + s.weight, 0),
          },
        ]
      : shown;

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Složení podle titulů</h3>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <div style={{ width: 220, height: 220, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value_czk"
                nameKey="label"
                innerRadius="58%"
                outerRadius="100%"
                paddingAngle={1}
                stroke="var(--canvas-dark)"
                strokeWidth={2}
              >
                {chartData.map((slice, index) => (
                  <Cell key={slice.label} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#2d2f2c',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: '#fff',
                }}
                formatter={(value, _name, item) => [czk(Number(value)), item?.payload?.label]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 220px', minWidth: 200 }}>
          {chartData.map((slice, index) => (
            <div key={slice.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 'var(--radius-full)',
                  background: DONUT_COLORS[index % DONUT_COLORS.length],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 14, flex: 1 }}>{slice.label}</span>
              <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', ...NUMERIC_STYLE }}>
                {share(slice.weight)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Allocation({ title, slices }: { title: string; slices: AllocationSlice[] }) {
  if (slices.length === 0) return null;

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {slices.map((slice) => (
          <div key={slice.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, width: 72 }}>{slice.label}</span>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 'var(--radius-full)',
                background: 'rgba(255,255,255,0.12)',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: `${slice.weight * 100}%`, height: '100%', background: 'var(--gold)' }} />
            </div>
            <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', width: 58, ...NUMERIC_STYLE }}>
              {share(slice.weight)}
            </span>
            <span style={{ fontSize: 13, width: 108, ...NUMERIC_STYLE }}>{czk(slice.value_czk)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Concentration({ data }: { data: Overview }) {
  if (data.concentration_warnings.length === 0) return null;

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Koncentrace</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {data.concentration_warnings.map((warning) => (
          <div
            key={warning.instrument_key}
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--loss-on-dark)',
              display: 'flex',
              gap: 8,
            }}
          >
            <span aria-hidden="true">▲</span>
            {warning.message}
          </div>
        ))}
      </div>
      <p style={{ ...CAPTION, marginTop: 12 }}>
        Není to chyba, jen údaj. Jedna pozice nad čtvrtinou portfolia znamená, že o výsledku
        rozhoduje především ona.
      </p>
    </section>
  );
}

function ValueChart({ scopeIds }: { scopeIds: number[] | undefined }) {
  const [points, setPoints] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPoints(await snapshotApi.list(scopeIds));
    } catch (err) {
      setError(errorText(err, 'Historii se nepodařilo načíst.'));
    }
  }, [scopeIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const takeSnapshot = async () => {
    setSaving(true);
    setError(null);
    try {
      setPoints(await snapshotApi.take(scopeIds));
    } catch (err) {
      setError(errorText(err, 'Snapshot se nepodařilo uložit.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={SECTION_TITLE}>Vývoj hodnoty</h3>
          <p style={{ ...CAPTION, marginTop: 6, maxWidth: 560 }}>
            Kreslí se z měsíčních snapshotů, ne zpětnou rekonstrukcí — ta by potřebovala
            historické ceny a kurzy ke každému dni. První rok bude řídký, pak přesný.
          </p>
        </div>
        <Button size="sm" variant="outline-dark" onClick={() => void takeSnapshot()} disabled={saving}>
          {saving ? 'Ukládám…' : 'Uložit snapshot'}
        </Button>
      </div>

      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginTop: 12 }}>{error}</div>}

      {points && points.length === 0 && (
        <p style={{ ...CAPTION, marginTop: 14 }}>
          Zatím žádný snapshot. Ulož první a graf začne růst.
        </p>
      )}

      {points && points.length > 0 && (
        <div style={{ height: 260, marginTop: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="snapshotFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dcb45c" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#dcb45c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => formatDate(String(value))}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={86}
                tickFormatter={(value) => czk(Number(value))}
              />
              <Tooltip
                contentStyle={{
                  background: '#2d2f2c',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: '#fff',
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                labelFormatter={(value) => formatDate(String(value))}
                formatter={(value) => czk(Number(value))}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }} />
              <Area
                type="monotone"
                dataKey="value_czk"
                name="Hodnota"
                stroke="#dcb45c"
                strokeWidth={2}
                fill="url(#snapshotFill)"
              />
              <Line type="monotone" dataKey="invested_czk" name="Vloženo" stroke="#6f9bc4" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function BenchmarkLine({
  scopeIds,
  fallbackTicker,
}: {
  scopeIds: number[] | undefined;
  fallbackTicker: string;
}) {
  const [result, setResult] = useState<BenchmarkComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    snapshotApi
      .benchmark(scopeIds)
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Benchmark se nepodařilo spočítat.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scopeIds]);

  const ticker = result?.ticker ?? fallbackTicker;

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Srovnání s indexem</h3>

      {loading && <p style={{ ...CAPTION, marginTop: 12 }}>Počítám…</p>}
      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginTop: 12 }}>{error}</div>}

      {result && result.benchmark_value_czk === null && (
        <p style={{ ...CAPTION, marginTop: 12, maxWidth: 620 }}>
          {result.note ?? `Hodnotu ${ticker} se nepodařilo zjistit.`}
        </p>
      )}

      {result && result.benchmark_value_czk !== null && (
        <>
          <p style={{ fontSize: 17, lineHeight: 1.6, marginTop: 12, marginBottom: 0, maxWidth: 700 }}>
            Kdyby všechny nákupy ve stejných datech a částkách šly do {ticker}, portfolio by dnes
            mělo <strong style={NUMERIC_STYLE}>{czk(result.benchmark_value_czk)}</strong>. Tvoje má{' '}
            <strong style={NUMERIC_STYLE}>{czk(result.portfolio_value_czk)}</strong>.
          </p>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              marginTop: 14,
              marginBottom: 0,
              color: TONE_COLOR_ON_DARK[toneFor(result.difference_czk)],
              ...NUMERIC_STYLE,
              textAlign: 'left',
            }}
          >
            {arrowFor(result.difference_czk)} {result.difference_czk !== null && result.difference_czk > 0 ? '+' : ''}
            {czk(result.difference_czk)}
          </p>
          <p style={{ ...CAPTION, marginTop: 10 }}>
            Přepočteno {formatDate(result.computed_at)}
            {result.is_manual ? ' · zadáno ručně' : ''}. Nejužitečnější možný výsledek tohohle
            čísla je zjištění, že vlastním výběrem index neporážíš.
          </p>
        </>
      )}
    </section>
  );
}

function DividendCalendar({ data }: { data: Overview }) {
  if (data.upcoming_dividends.length === 0) return null;

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Očekávané dividendy</h3>
      <p style={{ ...CAPTION, marginTop: 6 }}>
        Odhad z historické kadence výplat, ne oznámení společnosti.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {data.upcoming_dividends.map((item) => (
          <div
            key={item.instrument_key}
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, width: 72 }}>{item.ticker}</span>
            <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', width: 130 }}>
              {formatDate(item.expected_date)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', width: 90 }}>
              za {item.days_away} dní
            </span>
            <span style={{ fontSize: 14, ...NUMERIC_STYLE, minWidth: 110 }}>
              {czk(item.estimated_net_czk)}
            </span>
            <span style={{ ...EYEBROW, letterSpacing: 0 }}>
              z {item.based_on_payments} výplat
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
