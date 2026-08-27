import { useCallback, useEffect, useMemo, useState } from 'react';
import { quant, type QuantInput } from '../../api/client';
import { Button, Card, Input, Tabs } from '../../design/components';
import { share } from '../../lib/format';
import { usePortfolios } from '../../state/portfolioContext';
import { BenchmarkPanel } from './BenchmarkPanel';
import { CorrelationPanel } from './CorrelationPanel';
import { MonteCarloPanel } from './MonteCarloPanel';
import { OptimizePanel } from './OptimizePanel';
import { PerformancePanel } from './PerformancePanel';

const TABS = ['Výkonnost', 'Benchmark', 'Korelace', 'Monte Carlo', 'Optimalizace'];

interface Row {
  ticker: string;
  weight: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearsAgo(years: number): string {
  const when = new Date();
  when.setFullYear(when.getFullYear() - years);
  return when.toISOString().slice(0, 10);
}

/**
 * Portfolio-level modelling: performance, benchmark, Monte Carlo, optimisation.
 *
 * The composition defaults to what the user actually holds, weighted by current
 * value, so the analysis describes the real portfolio. It can then be edited by
 * hand to ask what-if questions without disturbing the records.
 */
export function AnalysisLayer() {
  const { selectedIds, selectionLabel } = usePortfolios();

  const [rows, setRows] = useState<Row[]>([]);
  const [startDate, setStartDate] = useState(yearsAgo(5));
  const [endDate, setEndDate] = useState(today());
  const [riskFreeRate, setRiskFreeRate] = useState('0.04');
  const [tab, setTab] = useState(0);
  const [derivedFromHoldings, setDerivedFromHoldings] = useState(true);
  const [excluded, setExcluded] = useState<{ ticker: string; reason: string }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const derived = await quant.fromHoldings(selectedIds);
      setRows(
        derived.tickers.map((ticker, index) => ({
          ticker,
          weight: String(derived.weights[index] ?? 0),
        })),
      );
      setExcluded(derived.excluded ?? []);
      setNote(derived.note);
      if (derived.start_date) setStartDate(derived.start_date);
      if (derived.end_date) setEndDate(derived.end_date);
      setDerivedFromHoldings(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Složení se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, [selectedIds]);

  useEffect(() => {
    void loadHoldings();
  }, [loadHoldings]);

  const weightSum = rows.reduce((total, row) => total + (parseFloat(row.weight) || 0), 0);
  const weightsBalanced = Math.abs(weightSum - 1) <= 0.01;

  const input = useMemo<QuantInput | null>(() => {
    const tickers = rows.map((row) => row.ticker.trim().toUpperCase()).filter(Boolean);
    const weights = rows.map((row) => parseFloat(row.weight) || 0);
    if (tickers.length === 0 || tickers.length !== weights.length || !weightsBalanced) return null;
    return {
      tickers,
      weights,
      start_date: startDate,
      end_date: endDate,
      risk_free_rate: parseFloat(riskFreeRate) || 0,
    };
  }, [rows, weightsBalanced, startDate, endDate, riskFreeRate]);

  const editRow = (index: number, field: keyof Row, value: string) => {
    setDerivedFromHoldings(false);
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 6 }}>ANALÝZA</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '-0.5px', margin: 0 }}>
          Modelování portfolia
        </h1>
        <p style={{ color: 'var(--on-dark-mute)', fontSize: 15, margin: '8px 0 0', lineHeight: 1.55, maxWidth: 680 }}>
          Počítá se z tržních dat pro zadané složení. Výchozí složení je{' '}
          {derivedFromHoldings ? `podle skutečných pozic (${selectionLabel})` : 'upravené ručně'} — váhy
          se dají přepsat a ptát se „co kdyby“, aniž by se cokoli měnilo v evidenci.
        </p>
      </div>

      <Card elevated>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', fontWeight: 600 }}>SLOŽENÍ</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="outline-dark" onClick={() => void loadHoldings()} disabled={loading}>
                Načíst ze skutečných pozic
              </Button>
              <Button
                size="sm"
                variant="outline-dark"
                onClick={() => {
                  setDerivedFromHoldings(false);
                  setRows((previous) => [...previous, { ticker: '', weight: '0' }]);
                }}
              >
                + Přidat titul
              </Button>
            </div>
          </div>

          {loading && <div style={{ color: 'var(--on-dark-mute)', fontSize: 14 }}>Načítám složení…</div>}
          {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14 }}>{error}</div>}

          {!loading && rows.length === 0 && (
            <div style={{ color: 'var(--on-dark-mute)', fontSize: 15, lineHeight: 1.55 }}>
              {note ?? 'Zatím není z čeho složit analýzu. Přidej pozice a dohledej ceny, nebo zadej tickery ručně.'}
            </div>
          )}

          {rows.map((row, index) => (
            <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <Input
                  placeholder="Ticker, například VTI"
                  value={row.ticker}
                  onChange={(e) => editRow(index, 'ticker', e.target.value.toUpperCase())}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  type="number"
                  placeholder="Váha"
                  value={row.weight}
                  onChange={(e) => editRow(index, 'weight', e.target.value)}
                />
              </div>
              <Button
                variant="outline-dark"
                onClick={() => {
                  setDerivedFromHoldings(false);
                  setRows((previous) => previous.filter((_, i) => i !== index));
                }}
              >
                ✕
              </Button>
            </div>
          ))}

          {rows.length > 0 && (
            <div
              style={{
                fontSize: 13,
                color: weightsBalanced ? 'var(--on-dark-mute)' : 'var(--loss-on-dark)',
              }}
            >
              Součet vah {share(weightSum, 1)}
              {!weightsBalanced && ' — musí být 100 %, jinak se analýza nespustí.'}
            </div>
          )}

          {excluded.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', lineHeight: 1.5 }}>
              Do analýzy nevstupuje:{' '}
              {excluded.map((item) => `${item.ticker} (${item.reason})`).join(', ')}.
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <Input label="Od" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <Input label="Do" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <Input
                label="Bezriziková sazba"
                type="number"
                value={riskFreeRate}
                onChange={(e) => setRiskFreeRate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Card>

      <Tabs items={TABS} active={tab} onChange={setTab} />

      {input ? (
        <div>
          {tab === 0 && <PerformancePanel input={input} />}
          {tab === 1 && <BenchmarkPanel input={input} />}
          {tab === 2 && <CorrelationPanel input={input} />}
          {tab === 3 && <MonteCarloPanel input={input} />}
          {tab === 4 && <OptimizePanel input={input} />}
        </div>
      ) : (
        <div style={{ color: 'var(--on-dark-mute)', fontSize: 15, lineHeight: 1.55, maxWidth: 620 }}>
          Doplň alespoň jeden titul a nastav váhy tak, aby dávaly dohromady 100 %. Pak se analýza
          spustí sama.
        </div>
      )}
    </div>
  );
}
