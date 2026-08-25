/**
 * The cumulative result, which is the reason the app exists.
 *
 * One number is allowed to be large: the total gain in CZK. Everything else —
 * the percentage, the value, what was put in, the money-weighted return — is
 * deliberately smaller, because a header where six numbers shout is a header
 * where none of them is read.
 */

import type { CSSProperties } from 'react';
import type { AssetClass, Overview } from '../../api/types';
import { arrowFor, czk, MISSING, percent, toneFor, TONE_COLOR_ON_DARK } from '../../lib/format';
import { ASSET_CLASS_LABEL, CAPTION, EYEBROW, PANEL } from './theme';

interface ResultHeaderProps {
  data: Overview;
  scopeLabel: string;
  narrow: boolean;
}

const NUM: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'gain' | 'loss' | 'flat';
  hint?: string;
}) {
  return (
    <div style={{ minWidth: 132 }}>
      <div style={EYEBROW}>{label}</div>
      <div
        style={{
          ...NUM,
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          marginTop: 4,
          color: tone ? TONE_COLOR_ON_DARK[tone] : 'var(--on-dark)',
        }}
      >
        {value}
      </div>
      {hint && <div style={{ ...CAPTION, fontSize: 12, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export function ResultHeader({ data, scopeLabel, narrow }: ResultHeaderProps) {
  const tone = toneFor(data.total_gain_czk);
  const arrow = arrowFor(data.total_gain_czk);
  const sign = data.total_gain_czk > 0 ? '+' : '';

  return (
    <section
      style={{
        ...PANEL,
        padding: narrow ? 20 : 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
      aria-label="Kumulativní výsledek"
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 }}>
        <span style={EYEBROW}>Celkový zisk</span>
        <span style={{ ...CAPTION, fontSize: 12 }}>{scopeLabel}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: narrow ? 12 : 24 }}>
        <div
          style={{
            ...NUM,
            fontFamily: 'var(--font-display)',
            fontSize: narrow ? 40 : 66,
            lineHeight: 1.02,
            letterSpacing: '-1.4px',
            color: TONE_COLOR_ON_DARK[tone],
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
          }}
        >
          {arrow && (
            <span aria-hidden="true" style={{ fontSize: narrow ? 20 : 30 }}>
              {arrow}
            </span>
          )}
          <span>
            {sign}
            {czk(data.total_gain_czk)}
          </span>
        </div>
        <div
          style={{
            ...NUM,
            fontFamily: 'var(--font-display)',
            fontSize: narrow ? 22 : 30,
            color: TONE_COLOR_ON_DARK[tone],
            paddingBottom: narrow ? 0 : 6,
          }}
        >
          {percent(data.total_gain_pct, 2, { withSign: true })}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: narrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 18,
          paddingTop: 18,
          borderTop: '1px solid var(--hairline-dark)',
        }}
      >
        <Stat label="Hodnota portfolia" value={czk(data.value_czk)} />
        <Stat label="Investováno" value={czk(data.invested_czk)} />
        <Stat
          label="XIRR"
          value={data.xirr === null ? MISSING : percent(data.xirr * 100, 1, { withSign: true })}
          tone={data.xirr === null ? undefined : toneFor(data.xirr)}
          hint="ročně, vážené časem"
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: narrow ? 16 : 32,
          paddingTop: 14,
          borderTop: '1px solid var(--divider-soft)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ ...CAPTION, fontSize: 13 }}>Realizováno</span>
          <span
            style={{
              ...NUM,
              fontSize: 15,
              fontWeight: 600,
              color: TONE_COLOR_ON_DARK[toneFor(data.realized_gain_czk)],
            }}
          >
            {arrowFor(data.realized_gain_czk)} {czk(data.realized_gain_czk)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ ...CAPTION, fontSize: 13 }}>Dividendy (čisté)</span>
          <span style={{ ...NUM, fontSize: 15, fontWeight: 600, color: 'var(--on-dark)' }}>
            {czk(data.net_dividends_czk)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ ...CAPTION, fontSize: 13 }}>Vybráno zpět</span>
          <span style={{ ...NUM, fontSize: 15, fontWeight: 600, color: 'var(--on-dark)' }}>
            {czk(data.withdrawn_czk)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: narrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 18,
          paddingTop: 18,
          borderTop: '1px solid var(--hairline-dark)',
        }}
      >
        <YtdStat data={data} />
        <SalesStat data={data} />
        <PositionCountStat data={data} />
      </div>
    </section>
  );
}

function YtdStat({ data }: { data: Overview }) {
  if (data.ytd_gain_pct === null) {
    return (
      <Stat
        label="Zhodnocení YTD"
        value={MISSING}
        hint={data.ytd_unavailable_reason ?? 'Chybí letošní snapshot.'}
      />
    );
  }
  return (
    <Stat
      label="Zhodnocení YTD"
      value={percent(data.ytd_gain_pct, 2, { withSign: true })}
      tone={toneFor(data.ytd_gain_pct)}
      hint={`od ${data.ytd_basis_date ? new Date(data.ytd_basis_date).toLocaleDateString('cs-CZ') : '—'} · ${czk(data.ytd_gain_czk)}`}
    />
  );
}

function SalesStat({ data }: { data: Overview }) {
  const exempt = data.ytd_sales_tax_exempt;
  return (
    <Stat
      label="Objem prodejů YTD"
      value={czk(data.ytd_sales_volume_czk)}
      hint={
        exempt === null
          ? 'Letos zatím žádný prodej'
          : exempt
            ? 'Daňově osv.: ANO'
            : 'Daňově osv.: NE — část nesplnila časový test'
      }
    />
  );
}

function PositionCountStat({ data }: { data: Overview }) {
  const breakdown = (Object.entries(data.position_count_by_class) as [AssetClass, number][])
    .sort(([, a], [, b]) => b - a)
    .map(([cls, count]) => `${count} ${ASSET_CLASS_LABEL[cls] ?? cls}`)
    .join(' · ');

  return <Stat label="Pozic v portfoliu" value={String(data.position_count)} hint={breakdown || undefined} />;
}
