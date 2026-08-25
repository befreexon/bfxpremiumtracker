/**
 * The input end of the layer: which ticker, on which venue, over which window.
 *
 * The analysis takes several seconds because it makes three network calls to a
 * flaky free data source, so a disabled button with a spinner would be a lie by
 * omission. Instead the wait shows the elapsed seconds — a real, measured
 * number — and names the step the backend is on, in the order it does them.
 */

import { useEffect, useState } from 'react';
import { Button } from '../../design/components';
import { DARK, Eyebrow, Panel, SelectField, TextField, ToggleField, usePrefersReducedMotion } from './primitives';
import type { Option } from './primitives';
import type { AnalyzeRequest } from './types';

/** The venues the backend knows a Yahoo suffix for; anything else is sent bare. */
const EXCHANGES: Option[] = [
  { value: '', label: 'Neuvedeno (americké burzy)' },
  { value: 'PRA', label: 'PRA — Praha' },
  { value: 'XETRA', label: 'XETRA — Frankfurt' },
  { value: 'FRA', label: 'FRA — Frankfurt (parket)' },
  { value: 'LSE', label: 'LSE — Londýn' },
  { value: 'WSE', label: 'WSE — Varšava' },
  { value: 'BUD', label: 'BUD — Budapešť' },
  { value: 'SWX', label: 'SWX — Curych' },
  { value: 'AMS', label: 'AMS — Amsterdam' },
  { value: 'PAR', label: 'PAR — Paříž' },
  { value: 'MIL', label: 'MIL — Milán' },
  { value: 'MCE', label: 'MCE — Madrid' },
  { value: 'STO', label: 'STO — Stockholm' },
  { value: 'OSL', label: 'OSL — Oslo' },
  { value: 'CPH', label: 'CPH — Kodaň' },
  { value: 'TSX', label: 'TSX — Toronto' },
  { value: 'ASX', label: 'ASX — Sydney' },
  { value: 'TYO', label: 'TYO — Tokio' },
];

const HORIZONS: Option[] = [
  { value: '63', label: '3 měsíce (63 obchodních dní)' },
  { value: '126', label: '6 měsíců (126 obchodních dní)' },
  { value: '252', label: '1 rok (252 obchodních dní)' },
  { value: '504', label: '2 roky (504 obchodních dní)' },
];

const LOOKBACKS: Option[] = [
  { value: '365', label: '1 rok' },
  { value: '730', label: '2 roky' },
  { value: '1095', label: '3 roky' },
  { value: '1825', label: '5 let' },
];

interface Example {
  ticker: string;
  exchange: string;
  label: string;
}

const EXAMPLES: Example[] = [
  { ticker: 'AAPL', exchange: '', label: 'AAPL' },
  { ticker: 'MSFT', exchange: '', label: 'MSFT' },
  { ticker: 'NVDA', exchange: '', label: 'NVDA' },
  { ticker: 'KO', exchange: '', label: 'KO' },
  { ticker: 'ASML', exchange: 'AMS', label: 'ASML · AMS' },
  { ticker: 'CEZ', exchange: 'PRA', label: 'CEZ · PRA' },
  { ticker: 'KOMB', exchange: 'PRA', label: 'KOMB · PRA' },
];

/**
 * What the backend is doing, in the order it does it. The boundaries are the
 * observed shape of the call, not a countdown — the elapsed seconds next to
 * them are the honest part.
 */
function stageFor(elapsedMs: number, includeNarrative: boolean): string {
  const seconds = elapsedMs / 1000;
  if (seconds < 1.5) return 'Překládám symbol na burzovní kód';
  if (seconds < 4) return 'Načítám historii cen';
  if (seconds < 8) return 'Čtu fundamenty a cílové ceny analytiků';
  if (seconds < 11) return 'Počítám technické ukazatele, skóre a projekci';
  if (includeNarrative && seconds < 30) return 'Čekám na slovní komentář jazykového modelu';
  if (seconds < 30) return 'Dokončuji hodnocení';
  return 'Trvá to déle než obvykle — zdroj dat odpovídá pomalu';
}

function ProgressStrip({
  startedAt,
  includeNarrative,
  onCancel,
}: {
  startedAt: number;
  includeNarrative: boolean;
  onCancel: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    setElapsedMs(Date.now() - startedAt);
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  // Asymptotic, so the bar never claims to be finished before the answer is
  // back. Twelve seconds is the typical full call.
  const progress = 1 - Math.exp(-elapsedMs / 12000);
  const seconds = (elapsedMs / 1000).toFixed(1).replace('.', ',');

  return (
    <div
      style={{
        marginTop: 18,
        border: `1px solid ${DARK.hairline}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        background: DARK.raised,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 14, color: DARK.text }} aria-live="polite">
          {stageFor(elapsedMs, includeNarrative)}
        </span>
        <span style={{ fontSize: 13, color: DARK.faint, fontVariantNumeric: 'tabular-nums' }}>
          běží {seconds} s
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Průběh analýzy"
        style={{ height: 4, borderRadius: 'var(--radius-full)', background: 'rgba(255,255,255,0.10)', overflow: 'hidden' }}
      >
        <div
          style={{
            width: `${(progress * 100).toFixed(1)}%`,
            height: '100%',
            background: DARK.gold,
            transition: reduced ? 'none' : 'width .25s linear',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: DARK.faint }}>
          Data se stahují z Yahoo Finance ve třech voláních. Dokud neskončí, není co zobrazit.
        </span>
        <Button variant="outline-dark" size="sm" onClick={onCancel}>
          Přestat čekat
        </Button>
      </div>
    </div>
  );
}

interface SearchPanelProps {
  busy: boolean;
  startedAt: number | null;
  lastRequest: AnalyzeRequest | null;
  onAnalyze: (request: AnalyzeRequest) => void;
  onCancel: () => void;
}

export function SearchPanel({ busy, startedAt, lastRequest, onAnalyze, onCancel }: SearchPanelProps) {
  const [ticker, setTicker] = useState(lastRequest?.ticker ?? '');
  const [exchange, setExchange] = useState(lastRequest?.exchange ?? '');
  const [horizon, setHorizon] = useState(String(lastRequest?.horizonDays ?? 252));
  const [lookback, setLookback] = useState(String(lastRequest?.lookbackDays ?? 730));
  const [includeNarrative, setIncludeNarrative] = useState(lastRequest?.includeNarrative ?? true);
  const [showOptions, setShowOptions] = useState(false);

  const trimmed = ticker.trim().toUpperCase();

  const submit = (override?: { ticker: string; exchange: string }) => {
    const symbol = (override?.ticker ?? trimmed).trim().toUpperCase();
    if (!symbol || busy) return;
    onAnalyze({
      ticker: symbol,
      exchange: override?.exchange ?? exchange,
      horizonDays: Number(horizon),
      lookbackDays: Number(lookback),
      includeNarrative,
    });
  };

  return (
    <Panel
      title="AI analýza jednoho titulu"
      subtitle="Zadej ticker. Analýza spočítá skóre ze čtyř dílčích částí, ukáže každý faktor, ze kterého skóre vzniklo, a odvodí rozdělení možných cen z historické volatility. Není to pokyn k obchodu ani doporučení."
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TextField
          label="Ticker"
          value={ticker}
          onChange={setTicker}
          onEnter={() => submit()}
          placeholder="např. MSFT"
          uppercase
          style={{ flex: '1 1 180px', minWidth: 160 }}
        />
        <SelectField
          label="Burza"
          value={exchange}
          options={EXCHANGES}
          onChange={setExchange}
          style={{ flex: '1 1 260px', minWidth: 220 }}
        />
        <Button onClick={() => submit()} disabled={busy || trimmed.length === 0} style={{ height: 44 }}>
          {busy ? 'Analyzuji…' : 'Analyzovat'}
        </Button>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Eyebrow>Příklady</Eyebrow>
        {EXAMPLES.map((example) => (
          <button
            key={`${example.ticker}:${example.exchange}`}
            type="button"
            disabled={busy}
            onClick={() => {
              setTicker(example.ticker);
              setExchange(example.exchange);
              submit({ ticker: example.ticker, exchange: example.exchange });
            }}
            style={{
              border: `1px solid ${DARK.hairline}`,
              background: 'transparent',
              color: DARK.mute,
              borderRadius: 'var(--radius-full)',
              padding: '5px 13px',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.45 : 1,
            }}
          >
            {example.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          aria-expanded={showOptions}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: DARK.gold,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
          }}
        >
          {showOptions ? '− Skrýt nastavení výpočtu' : '+ Nastavení výpočtu (horizont, historie, komentář)'}
        </button>

        {showOptions && (
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              borderTop: `1px solid ${DARK.divider}`,
              paddingTop: 16,
            }}
          >
            <SelectField
              label="Horizont projekce"
              value={horizon}
              options={HORIZONS}
              onChange={setHorizon}
              hint="Jak daleko dopředu se počítá rozdělení cen."
              style={{ flex: '1 1 260px', minWidth: 220 }}
            />
            <SelectField
              label="Délka historie"
              value={lookback}
              options={LOOKBACKS}
              onChange={setLookback}
              hint="Okno, ze kterého se berou výnosy, volatilita a průměry."
              style={{ flex: '1 1 200px', minWidth: 180 }}
            />
            <div style={{ flex: '1 1 260px', minWidth: 240, paddingTop: 22 }}>
              <ToggleField
                label="Vyžádat slovní komentář"
                checked={includeNarrative}
                onChange={setIncludeNarrative}
                hint="Komentář píše jazykový model z čísel spočítaných níže. Čísla samotná na něm nezávisí."
              />
            </div>
          </div>
        )}
      </div>

      {busy && startedAt !== null && (
        <ProgressStrip startedAt={startedAt} includeNarrative={includeNarrative} onCancel={onCancel} />
      )}
    </Panel>
  );
}
