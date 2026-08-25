import { useEffect, useState } from 'react';
import { csv, portfolios as portfolioApi } from '../api/client';
import { Button, Card, Input } from '../design/components';
import { czk } from '../lib/format';
import { useAuth } from '../state/authContext';
import { usePortfolios } from '../state/portfolioContext';

export function Settings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 720 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 6 }}>ÚČET</div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            letterSpacing: '-0.5px',
            margin: 0,
          }}
        >
          Nastavení
        </h1>
      </div>

      <PortfolioManager />
      <TaxSettings />
      <BackupSection />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card elevated>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: 0 }}>{title}</h2>
          {description && (
            <p style={{ color: 'var(--on-dark-mute)', fontSize: 14, margin: '6px 0 0', lineHeight: 1.5 }}>
              {description}
            </p>
          )}
        </div>
        {children}
      </div>
    </Card>
  );
}

function PortfolioManager() {
  const { portfolios, reload } = usePortfolios();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Akce se nepodařila.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Portfolia"
      description="Každé portfolio se dá sledovat zvlášť, nebo všechna dohromady přepínačem v hlavičce."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--hairline-dark)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {portfolios.map((portfolio) => (
          <div
            key={portfolio.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: 'var(--canvas-dark)',
            }}
          >
            {editing === portfolio.id ? (
              <>
                <div style={{ flex: 1 }}>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    void run(async () => {
                      await portfolioApi.update(portfolio.id, { name: editName.trim() });
                      setEditing(null);
                    })
                  }
                  disabled={busy || !editName.trim()}
                >
                  Uložit
                </Button>
                <Button size="sm" variant="outline-dark" onClick={() => setEditing(null)}>
                  Zrušit
                </Button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 15 }}>{portfolio.name}</span>
                <span style={{ fontSize: 13, color: 'var(--on-dark-mute)' }}>
                  {portfolio.transaction_count} transakcí
                </span>
                <Button
                  size="sm"
                  variant="outline-dark"
                  onClick={() => {
                    setEditing(portfolio.id);
                    setEditName(portfolio.name);
                  }}
                >
                  Přejmenovat
                </Button>
                <Button
                  size="sm"
                  variant="outline-dark"
                  disabled={busy || portfolios.length <= 1}
                  onClick={() => {
                    // Deleting a portfolio deletes its transactions with it.
                    const confirmed = window.confirm(
                      `Smazat portfolio „${portfolio.name}“ včetně ${portfolio.transaction_count} transakcí? Tohle nejde vrátit.`,
                    );
                    if (confirmed) void run(() => portfolioApi.remove(portfolio.id));
                  }}
                >
                  Smazat
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Input
            label="Nové portfolio"
            placeholder="Název, například Krypto"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button
          onClick={() =>
            void run(async () => {
              await portfolioApi.create(name.trim());
              setName('');
            })
          }
          disabled={busy || !name.trim()}
        >
          Přidat
        </Button>
      </div>

      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14 }}>{error}</div>}
    </Section>
  );
}

function TaxSettings() {
  const { user, updateSettings } = useAuth();
  const [years, setYears] = useState('3');
  const [cap, setCap] = useState('40000000');
  const [benchmark, setBenchmark] = useState('VWCE');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setYears(String(user.tax_test_years));
    setCap(String(user.tax_exempt_cap_czk));
    setBenchmark(user.benchmark_ticker);
  }, [user]);

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await updateSettings({
        tax_test_years: Number(years) || 3,
        tax_exempt_cap_czk: Number(cap) || 0,
        benchmark_ticker: benchmark.trim().toUpperCase(),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nastavení se nepodařilo uložit.');
    }
  };

  return (
    <Section
      title="Časový test a benchmark"
      description="Délka testu i strop osvobození se mění, proto jsou v nastavení a ne zadrátované v kódu."
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <Input label="Délka testu (roky)" type="number" value={years} onChange={(e) => setYears(e.target.value)} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Input label="Strop osvobození (Kč)" type="number" value={cap} onChange={(e) => setCap(e.target.value)} />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <Input label="Benchmark" value={benchmark} onChange={(e) => setBenchmark(e.target.value)} />
        </div>
      </div>

      <p style={{ color: 'var(--on-dark-mute)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
        Odpočet je orientační výpočet z data nákupu, ne daňové poradenství. Osvobození má od
        roku 2025 strop {czk(Number(cap) || 0)}. Pro daňové účely je závazné vlastní posouzení
        nebo konzultace s daňovým poradcem.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button onClick={() => void save()}>Uložit nastavení</Button>
        {saved && <span style={{ fontSize: 14, color: 'var(--gain-on-dark)' }}>Uloženo.</span>}
        {error && <span style={{ fontSize: 14, color: 'var(--loss-on-dark)' }}>{error}</span>}
      </div>
    </Section>
  );
}

function BackupSection() {
  const [error, setError] = useState<string | null>(null);

  const download = async (url: string, filename: string) => {
    setError(null);
    try {
      await csv.download(url, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stažení se nepodařilo.');
    }
  };

  return (
    <Section
      title="Záloha"
      description="Export je ve stejném formátu, jaký import čte. Bez něj jsi rukojmím jedné instance databáze."
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button onClick={() => void download(csv.exportUrl(), 'bfx-portfolio-zaloha.csv')}>
          Stáhnout zálohu
        </Button>
        <Button variant="outline-dark" onClick={() => void download(csv.templateUrl(false), 'import-sablona.csv')}>
          Šablona pro import
        </Button>
        <Button variant="outline-dark" onClick={() => void download(csv.templateUrl(true), 'import-vzor.csv')}>
          Vzor se všemi případy
        </Button>
      </div>
      {error && <div style={{ color: 'var(--loss-on-dark)', fontSize: 14 }}>{error}</div>}
    </Section>
  );
}
