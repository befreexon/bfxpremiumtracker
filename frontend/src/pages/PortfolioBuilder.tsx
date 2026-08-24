import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Select } from '../design/components';
import { parsePortfolioCsv } from '../lib/csv';
import { BENCHMARK_OPTIONS, PRESET_PORTFOLIOS, usePortfolio } from '../state/portfolioContext';
import logo from '../assets/logo.svg';

interface Row {
  ticker: string;
  weight: string;
}

function toRows(tickers: string[], weights: number[]): Row[] {
  return tickers.map((ticker, i) => ({ ticker, weight: String(weights[i] ?? 0) }));
}

export function PortfolioBuilder() {
  const navigate = useNavigate();
  const { portfolio, setPortfolio } = usePortfolio();

  const [preset, setPreset] = useState('Custom');
  const [rows, setRows] = useState<Row[]>(toRows(portfolio.tickers, portfolio.weights));
  const [startDate, setStartDate] = useState(portfolio.startDate);
  const [endDate, setEndDate] = useState(portfolio.endDate);
  const [riskFreeRate, setRiskFreeRate] = useState(String(portfolio.riskFreeRate));
  const [benchmarkTicker, setBenchmarkTicker] = useState(portfolio.benchmarkTicker);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCsvFile = (file: File) => {
    file
      .text()
      .then((text) => {
        const result = parsePortfolioCsv(text);
        if (result.error) {
          setError(result.error);
          return;
        }
        setPreset('Custom');
        setRows(result.rows.map((r) => ({ ticker: r.ticker, weight: String(r.weight) })));
        setError(null);
      })
      .catch(() => setError('Could not read that file.'));
  };

  const applyPreset = (name: string) => {
    setPreset(name);
    const def = PRESET_PORTFOLIOS[name];
    if (def) setRows(toRows(def.tickers, def.weights));
  };

  const updateRow = (index: number, field: keyof Row, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addRow = () => setRows((prev) => [...prev, { ticker: '', weight: '0' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const weightSum = rows.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0);

  const handleSubmit = () => {
    const tickers = rows.map((r) => r.ticker.trim().toUpperCase()).filter(Boolean);
    const weights = rows.map((r) => parseFloat(r.weight) || 0);

    if (tickers.length === 0) {
      setError('Add at least one ticker.');
      return;
    }
    if (tickers.length !== weights.length) {
      setError('Every ticker needs a weight.');
      return;
    }
    if (Math.abs(weightSum - 1) > 0.01) {
      setError(`Weights must sum to 1.00 (currently ${weightSum.toFixed(2)}).`);
      return;
    }
    if (!startDate || !endDate || startDate >= endDate) {
      setError('Pick a valid date range.');
      return;
    }

    setError(null);
    setPortfolio({
      tickers,
      weights,
      startDate,
      endDate,
      riskFreeRate: parseFloat(riskFreeRate) || 0,
      benchmarkTicker,
    });
    navigate('/dashboard');
  };

  return (
    <div style={{ minHeight: '100%', background: 'var(--surface-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 32px', borderBottom: '1px solid var(--hairline-light)' }}>
        <img src={logo} alt="" style={{ width: 28 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
          BFX Portfolio Pro
        </span>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '56px 24px 96px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 6 }}>PORTFOLIO</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '-0.5px', margin: 0, color: 'var(--ink)' }}>
            Build your portfolio
          </h1>
          <p style={{ color: 'var(--mute)', fontSize: 16, marginTop: 8 }}>
            Enter tickers and weights, or start from a preset. We'll pull real market data and run the analysis.
          </p>
        </div>

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Select
              label="Preset portfolio"
              options={['Custom', ...Object.keys(PRESET_PORTFOLIOS)]}
              value={preset}
              onChange={applyPreset}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--charcoal)', fontWeight: 600 }}>Holdings</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <a
                    href="/portfolio-template.csv"
                    download
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
                  >
                    Download CSV template
                  </a>
                  <Button variant="soft" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Import CSV
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCsvFile(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}>
                    <Input
                      placeholder="Ticker (e.g. VTI)"
                      value={row.ticker}
                      onChange={(e) => updateRow(i, 'ticker', e.target.value.toUpperCase())}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Input
                      type="number"
                      placeholder="Weight"
                      value={row.weight}
                      onChange={(e) => updateRow(i, 'weight', e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="md" onClick={() => removeRow(i)} disabled={rows.length <= 1}>
                    ✕
                  </Button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button variant="soft" size="sm" onClick={addRow}>
                  + Add holding
                </Button>
                <span style={{ fontSize: 13, color: Math.abs(weightSum - 1) > 0.01 ? 'var(--accent-danger-text)' : 'var(--mute)' }}>
                  Weights sum to {weightSum.toFixed(2)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <Input
                label="Risk-free rate"
                type="number"
                value={riskFreeRate}
                onChange={(e) => setRiskFreeRate(e.target.value)}
              />
              <Select
                label="Benchmark"
                options={Object.keys(BENCHMARK_OPTIONS)}
                value={benchmarkTicker}
                onChange={setBenchmarkTicker}
              />
            </div>

            {error && <div style={{ color: 'var(--accent-danger-text)', fontSize: 14 }}>{error}</div>}

            <Button size="lg" onClick={handleSubmit}>
              Analyze portfolio
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
