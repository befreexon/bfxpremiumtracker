import { useRef, useState } from 'react';
import { csv } from '../../api/client';
import type { ImportPreview, ImportResult, ImportRowStatus, Portfolio } from '../../api/types';
import { Button, Select } from '../../design/components';
import { CAPTION, EYEBROW, PANEL, SECTION_TITLE, TABLE, TD, TH, errorText } from './theme';

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  ok: 'Projde',
  warning: 'Varování',
  error: 'Nezaimportuje se',
  duplicate: 'Duplicita',
};

const STATUS_COLOR: Record<ImportRowStatus, string> = {
  ok: 'var(--gain-on-dark)',
  warning: 'var(--accent-warning)',
  error: 'var(--loss-on-dark)',
  duplicate: 'var(--on-dark-mute)',
};

interface ImportPanelProps {
  portfolios: Portfolio[];
  scopeIds: number[] | undefined;
  onImported: () => void | Promise<void>;
}

export function ImportPanel({ portfolios, scopeIds, onImported }: ImportPanelProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(portfolios[0]?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const targetId = portfolios.find((p) => p.name === target)?.id;

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setFileName(file.name);
      setPreview(await csv.preview(file, targetId));
    } catch (err) {
      setPreview(null);
      setError(errorText(err, 'Soubor se nepodařilo přečíst.'));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await csv.commit(preview.token, targetId);
      setResult(outcome);
      setPreview(null);
      setFileName(null);
      await onImported();
    } catch (err) {
      setError(errorText(err, 'Import se nepodařil.'));
    } finally {
      setBusy(false);
    }
  };

  const download = async (url: string, name: string) => {
    setError(null);
    try {
      await csv.download(url, name);
    } catch (err) {
      setError(errorText(err, 'Stažení se nepodařilo.'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section style={PANEL}>
        <h3 style={SECTION_TITLE}>Import z CSV</h3>
        <p style={{ ...CAPTION, marginTop: 6, maxWidth: 640 }}>
          Nejdřív náhled, teprve pak zápis. Zelené řádky projdou, žluté s varováním taky, červené
          se vynechají. Duplicity se přeskočí. Český Excel se středníky i desetinnými čárkami se
          pozná sám.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 16 }}>
          {portfolios.length > 1 && (
            <div style={{ width: 220 }}>
              <Select
                label="Do portfolia"
                options={portfolios.map((p) => p.name)}
                value={target}
                onChange={setTarget}
              />
            </div>
          )}
          <Button onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? 'Pracuji…' : 'Vybrat soubor'}
          </Button>
          <Button variant="outline-dark" onClick={() => void download(csv.templateUrl(false), 'import-sablona.csv')}>
            Šablona
          </Button>
          <Button variant="outline-dark" onClick={() => void download(csv.templateUrl(true), 'import-vzor.csv')}>
            Vzor se všemi případy
          </Button>
          <Button
            variant="outline-dark"
            onClick={() => void download(csv.exportUrl(scopeIds), 'bfx-portfolio-zaloha.csv')}
          >
            Stáhnout zálohu
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginTop: 14 }}>{error}</div>}

        {result && (
          <div style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6 }}>
            <span style={{ color: 'var(--gain-on-dark)' }}>
              Naimportováno {result.imported} transakcí.
            </span>
            {result.skipped > 0 && (
              <span style={{ color: 'var(--on-dark-mute)' }}> Vynecháno {result.skipped}.</span>
            )}
            {result.created_portfolios.length > 0 && (
              <span style={{ color: 'var(--on-dark-mute)' }}>
                {' '}
                Založeno portfolio: {result.created_portfolios.join(', ')}.
              </span>
            )}
          </div>
        )}
      </section>

      {preview && <PreviewTable preview={preview} fileName={fileName} busy={busy} onCommit={commit} />}
    </div>
  );
}

function PreviewTable({
  preview,
  fileName,
  busy,
  onCommit,
}: {
  preview: ImportPreview;
  fileName: string | null;
  busy: boolean;
  onCommit: () => void | Promise<void>;
}) {
  const importable = preview.counts.ok + preview.counts.warning;

  if (preview.fatal_error) {
    return (
      <section style={PANEL}>
        <h3 style={SECTION_TITLE}>Náhled — {fileName}</h3>
        <div style={{ color: 'var(--loss-on-dark)', fontSize: 15, marginTop: 12, lineHeight: 1.55 }}>
          {preview.fatal_error}
        </div>
      </section>
    );
  }

  return (
    <section style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={SECTION_TITLE}>Náhled — {fileName}</h3>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            {(Object.keys(STATUS_LABEL) as ImportRowStatus[]).map((status) => (
              <span key={status} style={{ fontSize: 13, color: STATUS_COLOR[status] }}>
                {STATUS_LABEL[status]}: {preview.counts[status] ?? 0}
              </span>
            ))}
          </div>
          {preview.new_portfolios.length > 0 && (
            <p style={{ ...CAPTION, marginTop: 8 }}>
              Založí se portfolio: {preview.new_portfolios.join(', ')}.
            </p>
          )}
        </div>
        <Button onClick={() => void onCommit()} disabled={busy || importable === 0}>
          {busy ? 'Importuji…' : `Importovat ${importable} řádků`}
        </Button>
      </div>

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 48 }}>Ř.</th>
              <th style={{ ...TH, width: 130 }}>Stav</th>
              <th style={TH}>Řádek</th>
              <th style={TH}>Poznámka</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.line_number}>
                <td style={{ ...TD, color: 'var(--on-dark-mute)' }}>{row.line_number}</td>
                <td style={{ ...TD, color: STATUS_COLOR[row.status] }}>{STATUS_LABEL[row.status]}</td>
                <td style={{ ...TD, fontSize: 13 }}>
                  {[row.raw.typ, row.raw.datum, row.raw.ticker, row.raw.mnozstvi, row.raw.cena, row.raw.mena]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
                <td style={{ ...TD, fontSize: 13, color: 'var(--on-dark-mute)' }}>
                  {row.messages.join(' ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ ...EYEBROW, marginTop: 14, letterSpacing: 0 }}>
        Oddělovač: {preview.delimiter === ';' ? 'středník' : 'čárka'}
      </p>
    </section>
  );
}
