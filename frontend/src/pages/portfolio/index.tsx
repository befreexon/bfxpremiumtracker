import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { overview as overviewApi, prices as priceApi, snapshots as snapshotApi } from '../../api/client';
import type { Overview, Transaction } from '../../api/types';
import { Button, Tabs } from '../../design/components';
import { dateTime } from '../../lib/format';
import { useAuth } from '../../state/authContext';
import { usePortfolios } from '../../state/portfolioContext';
import { ImportPanel } from './ImportPanel';
import { Insights } from './Insights';
import { PositionDetail } from './PositionDetail';
import { PositionsTable } from './PositionsTable';
import { ResultHeader } from './ResultHeader';
import { TransactionForm } from './TransactionForm';
import { CAPTION, PANEL, SECTION_TITLE, errorText } from './theme';
import { useIsNarrow } from './useMediaQuery';

const TABS = ['Pozice', 'Pohledy', 'Import a záloha'];

export function PortfolioLayer() {
  const { user } = useAuth();
  const { portfolios, selectedIds, selectionLabel, reload: reloadPortfolios } = usePortfolios();
  const narrow = useIsNarrow();

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [takingSnapshot, setTakingSnapshot] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await overviewApi.get(selectedIds));
    } catch (err) {
      setError(errorText(err, 'Portfolio se nepodařilo načíst.'));
    } finally {
      setLoading(false);
    }
  }, [selectedIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadAll = useCallback(async () => {
    setReloadToken((token) => token + 1);
    await Promise.all([load(), reloadPortfolios()]);
  }, [load, reloadPortfolios]);

  const refreshPrices = async () => {
    setRefreshing(true);
    setNotice(null);
    setError(null);
    try {
      const result = await priceApi.refresh(selectedIds);
      setRefreshedAt(new Date().toISOString());
      setNotice(
        result.missing.length === 0
          ? `Ceny aktualizovány (${result.refreshed}).`
          : `Aktualizováno ${result.refreshed}. Nenašla se cena pro: ${result.missing
              .map((key) => key.split('|')[0])
              .join(', ')}. Zadej ji ručně.`,
      );
      await load();
    } catch (err) {
      setError(errorText(err, 'Ceny se nepodařilo aktualizovat.'));
    } finally {
      setRefreshing(false);
    }
  };

  const backfillRates = async () => {
    setNotice(null);
    setError(null);
    try {
      const result = await priceApi.backfillFx(selectedIds);
      setNotice(
        result.still_missing.length === 0
          ? `Doplněno ${result.filled} kurzů.`
          : `Doplněno ${result.filled}. Nedohledal se kurz u ${result.still_missing.length} transakcí — zadej ho ručně u dané transakce.`,
      );
      await load();
    } catch (err) {
      setError(errorText(err, 'Kurzy se nepodařilo doplnit.'));
    }
  };

  const takeSnapshot = async () => {
    setTakingSnapshot(true);
    setError(null);
    try {
      await snapshotApi.take(selectedIds);
      await load();
      setNotice('Dnešní data uložena — YTD zhodnocení je aktuální.');
    } catch (err) {
      setError(errorText(err, 'Snapshot se nepodařilo uložit.'));
    } finally {
      setTakingSnapshot(false);
    }
  };

  const setManualPrice = async (key: string, price: number) => {
    await priceApi.setManual(key, price);
    await load();
  };

  const clearManualPrice = async (key: string) => {
    await priceApi.clearManual(key);
    await load();
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (transaction: Transaction) => {
    setEditing(transaction);
    setFormOpen(true);
  };

  if (loading && !data) {
    return <div style={{ color: 'var(--on-dark-mute)', fontSize: 15 }}>Načítám portfolio…</div>;
  }

  const isEmpty = !!data && data.positions.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && (
        <div style={{ color: 'var(--loss-on-dark)', fontSize: 15, lineHeight: 1.55 }}>{error}</div>
      )}

      {data && (
        <ResultHeader
          data={data}
          scopeLabel={selectionLabel}
          narrow={narrow}
          onTakeSnapshot={() => void takeSnapshot()}
          takingSnapshot={takingSnapshot}
        />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="sm" onClick={openAdd}>
          Přidat transakci
        </Button>
        <Button size="sm" variant="outline-dark" onClick={() => void refreshPrices()} disabled={refreshing}>
          {refreshing ? 'Aktualizuji…' : 'Aktualizovat ceny'}
        </Button>
        {data && data.positions_missing_fx.length > 0 && (
          <Button size="sm" variant="outline-dark" onClick={() => void backfillRates()}>
            Doplnit kurzy ({data.positions_missing_fx.length})
          </Button>
        )}
        {refreshedAt && (
          <span style={{ fontSize: 12, color: 'var(--on-dark-mute)' }}>
            naposledy {dateTime(refreshedAt)}
          </span>
        )}
        <Link to="/vyrocni-zprava" target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto' }}>
          <Button size="sm" variant="outline-dark">
            Roční přehled ↗
          </Button>
        </Link>
      </div>

      {notice && <div style={{ fontSize: 14, color: 'var(--on-dark-mute)', lineHeight: 1.5 }}>{notice}</div>}

      {data?.warnings.map((warning) => (
        <div key={warning} style={{ fontSize: 14, color: 'var(--accent-warning)', lineHeight: 1.5 }}>
          {warning}
        </div>
      ))}

      <Tabs items={TABS} active={tab} onChange={setTab} />

      {tab === 0 && data && (
        isEmpty ? (
          <EmptyState onAdd={openAdd} onImport={() => setTab(2)} />
        ) : (
          <PositionsTable
            positions={data.positions}
            narrow={narrow}
            expandedKey={expandedKey}
            onToggle={(key) => setExpandedKey((current) => (current === key ? null : key))}
            onSetManualPrice={setManualPrice}
            onClearManualPrice={clearManualPrice}
            renderDetail={(position) => (
              <PositionDetail
                position={position}
                portfolios={portfolios}
                scopeIds={selectedIds}
                taxYears={user?.tax_test_years ?? 3}
                reloadToken={reloadToken}
                narrow={narrow}
                onChanged={reloadAll}
                onEditTransaction={openEdit}
                onAddTransaction={openAdd}
              />
            )}
          />
        )
      )}

      {tab === 1 && data && (
        <Insights
          data={data}
          scopeIds={selectedIds}
          benchmarkTicker={user?.benchmark_ticker ?? 'VWCE'}
          onChanged={load}
        />
      )}

      {tab === 2 && (
        <ImportPanel portfolios={portfolios} scopeIds={selectedIds} onImported={reloadAll} />
      )}

      <TransactionForm
        open={formOpen}
        portfolios={portfolios}
        defaultPortfolioId={selectedIds?.[0] ?? portfolios[0]?.id ?? null}
        initial={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={reloadAll}
      />
    </div>
  );
}

function EmptyState({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Zatím tu nic není</h3>
      <p style={{ ...CAPTION, marginTop: 8, maxWidth: 560 }}>
        Přidej první transakci ručně, nebo naimportuj historii z CSV. Import běží přes náhled,
        takže se nic nezapíše dřív, než si to prohlédneš.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <Button onClick={onAdd}>Přidat první transakci</Button>
        <Button variant="outline-dark" onClick={onImport}>
          Naimportovat z CSV
        </Button>
      </div>
    </section>
  );
}
