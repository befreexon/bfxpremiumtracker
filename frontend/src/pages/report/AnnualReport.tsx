/**
 * "Roční přehled" — a print-optimised, one-document summary of the currently
 * selected portfolio(s): totals, allocation, top positions, dividends,
 * realised results. Deliberately light-on-white rather than the app's dark
 * canvas, since this is meant to be printed or saved as a PDF, not read on
 * screen — and it reuses exactly the numbers the rest of the app already
 * shows, nothing recomputed or invented for the occasion.
 *
 * Lives outside AppShell (see App.tsx) so nothing needs to be hidden for
 * print except its own two buttons.
 */

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { overview as overviewApi } from '../../api/client';
import type { AllocationSlice, Overview, Position } from '../../api/types';
import { Button } from '../../design/components';
import { arrowFor, czk, date, dateTime, percent, quantity, share, toneFor, TONE_COLOR } from '../../lib/format';
import { useAuth } from '../../state/authContext';
import { usePortfolios } from '../../state/portfolioContext';

const PAGE: CSSProperties = {
  maxWidth: 880,
  margin: '0 auto',
  padding: '40px 24px 80px',
  color: 'var(--ink)',
  background: 'var(--canvas-light)',
  minHeight: '100%',
};

const H2: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  margin: '0 0 12px',
  paddingTop: 20,
  borderTop: '1px solid var(--hairline-light)',
};

const TABLE: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const TH: CSSProperties = {
  textAlign: 'left',
  color: 'var(--mute)',
  fontWeight: 600,
  padding: '4px 8px',
  borderBottom: '1px solid var(--hairline-light)',
};
const TD: CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--hairline-light)' };
const TD_NUM: CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export function AnnualReport() {
  const { user } = useAuth();
  const { selectedIds, selectionLabel } = usePortfolios();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await overviewApi.get(selectedIds);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Přehled se nepodařilo načíst.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  const year = new Date().getFullYear();
  const generatedAt = new Date().toISOString();

  return (
    <div style={PAGE}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 16mm; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 24 }}>
        <Link to="/portfolio" style={{ textDecoration: 'none' }}>
          <Button variant="outline" size="sm">← Zpět do portfolia</Button>
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          Tisknout / Uložit jako PDF
        </Button>
      </div>

      <div style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: 'var(--mute)' }}>ROČNÍ PŘEHLED · {year}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, margin: '6px 0 0' }}>
          {selectionLabel}
        </h1>
        <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6 }}>
          {user?.display_name ?? user?.email} · vygenerováno {dateTime(generatedAt)}
        </div>
      </div>

      {error && <div style={{ color: 'var(--loss)', fontSize: 14 }}>{error}</div>}
      {!data && !error && <div style={{ color: 'var(--mute)', fontSize: 14 }}>Načítám přehled…</div>}

      {data && (
        <>
          <SummarySection data={data} />
          <AllocationSection data={data} />
          <PositionsSection positions={data.positions} />
          <DividendsSection data={data} />
          <NoticesSection data={data} />
        </>
      )}

      <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid var(--hairline-light)', fontSize: 11, color: 'var(--stone)', lineHeight: 1.5 }}>
        Sestaveno výhradně z dat vedených v této evidenci (vlastní transakce, dohledané nebo ručně
        zadané ceny a kurzy). Není daňové ani investiční poradenství — jde o pohled na zaznamenaná
        data, ne o doporučení.
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'gain' | 'loss' | 'flat' }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginTop: 2, color: tone ? TONE_COLOR[tone] : 'var(--ink)' }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

function SummarySection({ data }: { data: Overview }) {
  return (
    <section>
      <h2 style={{ ...H2, borderTop: 'none', paddingTop: 0 }}>Výsledek</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
        <Stat label="Hodnota portfolia" value={czk(data.value_czk)} />
        <Stat label="Investováno" value={czk(data.invested_czk)} />
        <Stat
          label="Celkový zisk"
          value={`${czk(data.total_gain_czk)} (${percent(data.total_gain_pct, 1, { withSign: true })})`}
          tone={toneFor(data.total_gain_czk)}
        />
        <Stat
          label="XIRR"
          value={data.xirr === null ? '—' : percent(data.xirr * 100, 1, { withSign: true })}
          hint="ročně, vážené časem"
          tone={data.xirr === null ? undefined : toneFor(data.xirr)}
        />
        <Stat label="Realizováno" value={czk(data.realized_gain_czk)} tone={toneFor(data.realized_gain_czk)} />
        <Stat label="Dividendy (čisté)" value={czk(data.net_dividends_czk)} />
        <Stat
          label="Zhodnocení YTD"
          value={data.ytd_gain_pct === null ? '—' : percent(data.ytd_gain_pct, 1, { withSign: true })}
          hint={data.ytd_basis_date ? `od ${date(data.ytd_basis_date)}` : (data.ytd_unavailable_reason ?? undefined)}
          tone={data.ytd_gain_pct === null ? undefined : toneFor(data.ytd_gain_pct)}
        />
        <Stat
          label="Prodeje YTD"
          value={czk(data.ytd_sales_volume_czk)}
          hint={
            data.ytd_sales_tax_exempt === null
              ? 'letos žádný prodej'
              : data.ytd_sales_tax_exempt
                ? 'daňově osvobozeno'
                : 'časový test nesplněn u části'
          }
        />
      </div>
    </section>
  );
}

function AllocationTable({ title, slices }: { title: string; slices: AllocationSlice[] }) {
  if (slices.length === 0) return null;
  return (
    <div style={{ flex: '1 1 240px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)', marginBottom: 6 }}>{title}</div>
      <table style={TABLE}>
        <tbody>
          {slices.map((slice) => (
            <tr key={slice.label}>
              <td style={TD}>{slice.label}</td>
              <td style={TD_NUM}>{share(slice.weight)}</td>
              <td style={TD_NUM}>{czk(slice.value_czk)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllocationSection({ data }: { data: Overview }) {
  return (
    <section>
      <h2 style={H2}>Složení portfolia</h2>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <AllocationTable title="Podle třídy aktiv" slices={data.allocation_by_class} />
        <AllocationTable title="Podle měny" slices={data.allocation_by_currency} />
        <AllocationTable title="Podle sektoru" slices={data.allocation_by_sector} />
      </div>
    </section>
  );
}

function PositionsSection({ positions }: { positions: Position[] }) {
  const open = positions.filter((p) => p.quantity > 0);
  if (open.length === 0) return null;
  return (
    <section>
      <h2 style={H2}>Pozice ({open.length})</h2>
      <table style={TABLE}>
        <thead>
          <tr>
            <th style={TH}>Titul</th>
            <th style={{ ...TH, textAlign: 'right' }}>Množství</th>
            <th style={{ ...TH, textAlign: 'right' }}>Hodnota</th>
            <th style={{ ...TH, textAlign: 'right' }}>Zisk</th>
            <th style={{ ...TH, textAlign: 'right' }}>Podíl</th>
          </tr>
        </thead>
        <tbody>
          {open.map((position) => (
            <tr key={`${position.ticker}-${position.exchange}-${position.currency}`}>
              <td style={TD}>
                {position.ticker} <span style={{ color: 'var(--stone)' }}>{position.currency}</span>
              </td>
              <td style={TD_NUM}>{quantity(position.quantity)}</td>
              <td style={TD_NUM}>{czk(position.value_czk)}</td>
              <td style={{ ...TD_NUM, color: position.total_gain_czk === null ? undefined : TONE_COLOR[toneFor(position.total_gain_czk)] }}>
                {position.total_gain_czk === null
                  ? '—'
                  : `${arrowFor(position.total_gain_czk)} ${czk(position.total_gain_czk)} (${percent(position.total_gain_pct, 1, { withSign: true })})`}
              </td>
              <td style={TD_NUM}>{share(position.weight)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DividendsSection({ data }: { data: Overview }) {
  if (data.trailing_12m_dividends_czk <= 0) return null;
  return (
    <section>
      <h2 style={H2}>Dividendy (12 měsíců)</h2>
      <div style={{ display: 'flex', gap: 32, marginBottom: 12 }}>
        <Stat label="Celkem" value={czk(data.trailing_12m_dividends_czk)} />
        <Stat label="Výnos" value={percent(data.dividend_yield_pct, 2)} />
        <Stat label="Výnos z nákladů" value={percent(data.dividend_yield_on_cost_pct, 2)} />
      </div>
      {data.dividends_by_instrument.length > 0 && (
        <table style={TABLE}>
          <tbody>
            {data.dividends_by_instrument.map((row) => (
              <tr key={row.ticker}>
                <td style={TD}>{row.ticker}</td>
                <td style={TD_NUM}>{czk(row.value_czk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function NoticesSection({ data }: { data: Overview }) {
  const notices = [
    ...data.warnings,
    ...(data.positions_missing_price.length
      ? [`Chybí cena u: ${data.positions_missing_price.join(', ')}.`]
      : []),
    ...(data.positions_missing_fx.length
      ? [`Chybí kurz u: ${data.positions_missing_fx.join(', ')}.`]
      : []),
  ];
  if (notices.length === 0) return null;
  return (
    <section>
      <h2 style={H2}>Poznámky k datům</h2>
      <ul style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
        {notices.map((notice, index) => (
          <li key={index}>{notice}</li>
        ))}
      </ul>
    </section>
  );
}
