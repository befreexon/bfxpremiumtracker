import { useCallback, useRef, useState } from 'react';
import { ai as aiApi } from '../../api/client';
import { Button } from '../../design/components';
import { dateTime } from '../../lib/format';
import { AnalysisHeader } from './AnalysisHeader';
import { ConsensusPanel } from './ConsensusPanel';
import { FundamentalsTable } from './FundamentalsTable';
import { PriceChart } from './PriceChart';
import { ProjectionPanel } from './ProjectionPanel';
import { ScoreBreakdown } from './ScoreBreakdown';
import { SearchPanel } from './SearchPanel';
import { VerdictCard } from './VerdictCard';
import { Chip, DARK, NoteBlock, Panel } from './primitives';
import { narrowAnalysis, type AiAnalysis, type AnalyzeRequest } from './types';

export function AiLayer() {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<AnalyzeRequest | null>(null);
  //: Bumped on cancel so a reply from an abandoned run is ignored.
  const runId = useRef(0);

  const analyze = useCallback(async (request: AnalyzeRequest) => {
    const id = ++runId.current;
    setBusy(true);
    setStartedAt(Date.now());
    setError(null);
    setLastRequest(request);
    try {
      const payload = await aiApi.analyze({
        ticker: request.ticker,
        exchange: request.exchange,
        horizon_days: request.horizonDays,
        lookback_days: request.lookbackDays,
        include_narrative: request.includeNarrative,
      });
      if (id !== runId.current) return;
      setAnalysis(narrowAnalysis(payload));
    } catch (err) {
      if (id !== runId.current) return;
      setAnalysis(null);
      setError(err instanceof Error ? err.message : 'Analýzu se nepodařilo spočítat.');
    } finally {
      if (id === runId.current) {
        setBusy(false);
        setStartedAt(null);
      }
    }
  }, []);

  const cancel = () => {
    runId.current += 1;
    setBusy(false);
    setStartedAt(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div style={{ fontSize: 13, color: DARK.mute, marginBottom: 6, letterSpacing: '0.08em' }}>
          AI ANALÝZA
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '-0.5px', margin: 0 }}>
          Jeden titul pod lupou
        </h1>
        <p style={{ color: DARK.mute, fontSize: 15, lineHeight: 1.6, margin: '8px 0 0', maxWidth: 720 }}>
          Posudek, ne pokyn k obchodu. Každé číslo je dohledatelné až k faktoru, ze kterého vzniklo,
          a projekce je rozdělení konců vyplývající z historické volatility — ne předpověď.
        </p>
      </div>

      <SearchPanel
        busy={busy}
        startedAt={startedAt}
        lastRequest={lastRequest}
        onAnalyze={(request) => void analyze(request)}
        onCancel={cancel}
      />

      {error && (
        <Panel title="Analýza se nepovedla">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ color: 'var(--loss-on-dark)', fontSize: 15, lineHeight: 1.6, maxWidth: 640 }}>
              {error}
            </div>
            {lastRequest && (
              <Button size="sm" variant="outline-dark" onClick={() => void analyze(lastRequest)}>
                Zkusit znovu
              </Button>
            )}
          </div>
        </Panel>
      )}

      {analysis && <AnalysisBody analysis={analysis} />}
    </div>
  );
}

function AnalysisBody({ analysis }: { analysis: AiAnalysis }) {
  const currency = analysis.quote.currency;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <AnalysisHeader analysis={analysis} />
      <VerdictCard assessment={analysis.assessment} />
      <ScoreBreakdown assessment={analysis.assessment} currency={currency} />
      <PriceChart technicals={analysis.technicals} currency={currency} />
      <FundamentalsTable fundamentals={analysis.fundamentals} currency={currency} />
      <ProjectionPanel projection={analysis.projection} currency={currency} />
      <ConsensusPanel consensus={analysis.consensus} price={analysis.quote.price} currency={currency} />
      <NarrativePanel analysis={analysis} />
      <MissingData analysis={analysis} />
      <Disclaimer text={analysis.disclaimer} generatedAt={analysis.generated_at} symbol={analysis.resolved_symbol} />
    </div>
  );
}

function NarrativePanel({ analysis }: { analysis: AiAnalysis }) {
  const narrative = analysis.narrative;
  if (!narrative) return null;

  if (!narrative.generated) {
    return (
      <Panel title="Slovní komentář">
        {/* Not an error state: the quantitative analysis above stands on its own. */}
        <NoteBlock>
          {narrative.note} Kvantitativní část výše na něm nezávisí a platí i bez něj.
        </NoteBlock>
      </Panel>
    );
  }

  return (
    <Panel title="Slovní komentář" subtitle={narrative.model ? `model ${narrative.model}` : undefined}>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: DARK.text, whiteSpace: 'pre-wrap' }}>
        {narrative.text}
      </div>
    </Panel>
  );
}

function MissingData({ analysis }: { analysis: AiAnalysis }) {
  if (analysis.missing_data.length === 0) return null;

  return (
    <Panel
      title="Co se nepodařilo získat"
      subtitle={`${analysis.missing_data.length} údajů`}
    >
      <p style={{ fontSize: 14, lineHeight: 1.6, color: DARK.mute, margin: '0 0 12px' }}>
        Tyhle údaje zdroj nevrátil. Nedosadila se za ně nula — chybí, a hodnocení výše to
        promítá do uvedené spolehlivosti.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {analysis.missing_data.map((item) => (
          <Chip key={item}>{item}</Chip>
        ))}
      </div>
    </Panel>
  );
}

function Disclaimer({
  text,
  generatedAt,
  symbol,
}: {
  text: string;
  generatedAt: string;
  symbol: string;
}) {
  return (
    <div
      style={{
        borderTop: `1px solid ${DARK.hairline}`,
        paddingTop: 18,
        fontSize: 14,
        lineHeight: 1.65,
        color: DARK.mute,
        maxWidth: 780,
      }}
    >
      {text}
      <div style={{ marginTop: 10, fontSize: 12 }}>
        Spočítáno {dateTime(generatedAt)} · symbol {symbol}
      </div>
    </div>
  );
}
