/**
 * Add or edit one transaction.
 *
 * The four types mean different things in the same four fields, and that is
 * where people get their own numbers wrong. So every type carries its own
 * inline explanation and its own field labels: on a dividend the price field is
 * the gross total for the whole payment and the fee is the tax withheld; on an
 * adjustment the quantity is a ratio, not a share count.
 *
 * No <form> element anywhere — onClick and onChange only.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { portfolios as portfolioApi } from '../../api/client';
import type { AssetClass, Portfolio, Transaction, TransactionType } from '../../api/types';
import { Button, Input, Select } from '../../design/components';
import { ASSET_CLASS_LABEL, TYPE_LABEL, errorText } from './theme';

const TYPES: TransactionType[] = ['BUY', 'SELL', 'DIV', 'ADJUST'];
const CLASSES: AssetClass[] = ['STOCK', 'ETF', 'CRYPTO'];

const HELP: Record<TransactionType, string> = {
  BUY:
    'Množství je počet kusů, cena je cena za jeden kus v měně obchodu. Poplatek se přičítá ' +
    'k pořizovací ceně. Záporný poplatek je povolený — sníží nákladovou základnu, což je způsob, ' +
    'jak se zapisuje přiřazený short put.',
  SELL:
    'Prodává se metodou FIFO, tedy od nejstarší tranše. Množství je počet prodaných kusů, ' +
    'cena je cena za kus. Poplatek se odečítá z výnosu.',
  DIV:
    'Cena je hrubá částka celé výplaty, ne částka na kus. Poplatek je sražená daň. ' +
    'Množství nech na 1 — u dividendy se nepoužívá.',
  ADJUST:
    'Množství je poměr splitu: 4 znamená split 4:1 (čtyřikrát víc kusů za čtvrtinovou cenu), ' +
    '0,25 znamená reverzní split 1:4. Cena ani poplatek se u splitu nepoužijí.',
};

const QUANTITY_LABEL: Record<TransactionType, string> = {
  BUY: 'Množství (ks)',
  SELL: 'Množství (ks)',
  DIV: 'Množství (nech 1)',
  ADJUST: 'Poměr splitu',
};

const PRICE_LABEL: Record<TransactionType, string> = {
  BUY: 'Cena za kus',
  SELL: 'Cena za kus',
  DIV: 'Hrubá částka výplaty',
  ADJUST: '',
};

const FEE_LABEL: Record<TransactionType, string> = {
  BUY: 'Poplatek',
  SELL: 'Poplatek',
  DIV: 'Sražená daň',
  ADJUST: '',
};

export interface TransactionPreset {
  ticker?: string;
  exchange?: string;
  currency?: string;
  asset_class?: AssetClass;
  name?: string;
  type?: TransactionType;
}

interface Draft {
  type: TransactionType;
  date: string;
  ticker: string;
  exchange: string;
  assetClass: AssetClass;
  quantity: string;
  price: string;
  currency: string;
  fee: string;
  fxRate: string;
  isin: string;
  name: string;
  note: string;
  portfolioId: number | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function draftFrom(
  initial: Transaction | null,
  preset: TransactionPreset | null,
  defaultPortfolioId: number | null,
): Draft {
  if (initial) {
    return {
      type: initial.type,
      date: initial.date.slice(0, 10),
      ticker: initial.ticker,
      exchange: initial.exchange,
      assetClass: initial.asset_class,
      quantity: String(initial.quantity),
      price: String(initial.price),
      currency: initial.currency,
      fee: String(initial.fee ?? 0),
      fxRate: initial.fx_rate === null ? '' : String(initial.fx_rate),
      isin: initial.isin,
      name: initial.name,
      note: initial.note,
      portfolioId: initial.portfolio_id,
    };
  }
  const type = preset?.type ?? 'BUY';
  return {
    type,
    date: today(),
    ticker: preset?.ticker ?? '',
    exchange: preset?.exchange ?? '',
    assetClass: preset?.asset_class ?? 'STOCK',
    quantity: type === 'DIV' ? '1' : '',
    price: '',
    currency: preset?.currency ?? 'CZK',
    fee: '0',
    fxRate: '',
    isin: '',
    name: preset?.name ?? '',
    note: '',
    portfolioId: defaultPortfolioId,
  };
}

/** Accepts both "1 234,56" and "1234.56"; empty means "not given". */
function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s| | /g, '').replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const NOTE_STYLE: CSSProperties = {
  minHeight: 76,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--hairline-light)',
  padding: '10px 16px',
  fontSize: 16,
  fontFamily: 'var(--font-body)',
  color: 'var(--ink)',
  background: 'var(--canvas-light)',
  outline: 'none',
  resize: 'vertical',
  width: '100%',
};

interface TransactionFormProps {
  open: boolean;
  portfolios: Portfolio[];
  defaultPortfolioId: number | null;
  initial?: Transaction | null;
  preset?: TransactionPreset | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export function TransactionForm({
  open,
  portfolios,
  defaultPortfolioId,
  initial = null,
  preset = null,
  onClose,
  onSaved,
}: TransactionFormProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial, preset, defaultPortfolioId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(draftFrom(initial, preset, defaultPortfolioId));
      setError(null);
      setSaving(false);
    }
    // The identity of `preset` changes on every render of the parent, so the
    // draft is rebuilt from the values that actually matter instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, defaultPortfolioId, preset?.ticker, preset?.exchange, preset?.currency]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const portfolioNames = useMemo(() => portfolios.map((item) => item.name), [portfolios]);
  const selectedPortfolio = portfolios.find((item) => item.id === draft.portfolioId) ?? null;

  if (!open) return null;

  const isSplit = draft.type === 'ADJUST';
  const isDividend = draft.type === 'DIV';
  const foreign = draft.currency.trim().toUpperCase() !== 'CZK' && draft.currency.trim() !== '';

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const changeType = (label: string) => {
    const next = TYPES.find((type) => TYPE_LABEL[type] === label) ?? 'BUY';
    set({
      type: next,
      quantity: next === 'DIV' ? '1' : draft.quantity,
      fee: next === 'ADJUST' ? '0' : draft.fee,
    });
  };

  const validate = (): string | null => {
    if (!draft.portfolioId) return 'Vyber portfolio, do kterého transakce patří.';
    if (!draft.date) return 'Doplň datum obchodu.';
    if (!draft.ticker.trim()) return 'Doplň ticker, například NVDA.';
    if (!draft.exchange.trim()) return 'Doplň burzu, například NASDAQ nebo XETRA.';
    if (!draft.currency.trim()) return 'Doplň měnu obchodu, například USD.';

    const qty = toNumber(draft.quantity);
    if (qty === null) return 'Množství musí být číslo.';
    if (isSplit && qty <= 0) return 'Poměr splitu musí být kladné číslo. 4 = split 4:1, 0,25 = reverzní 1:4.';
    if (!isSplit && qty <= 0) return 'Množství musí být větší než nula.';

    if (!isSplit) {
      const price = toNumber(draft.price);
      if (price === null) {
        return isDividend
          ? 'Doplň hrubou částku výplaty. U dividendy jde o částku za celou výplatu, ne za kus.'
          : 'Doplň cenu za kus.';
      }
      if (price < 0) return 'Cena nemůže být záporná.';
      if (draft.fee.trim() !== '' && toNumber(draft.fee) === null) return 'Poplatek musí být číslo.';
    }

    if (foreign && draft.fxRate.trim() !== '' && toNumber(draft.fxRate) === null) {
      return 'Kurz musí být číslo, například 23,45.';
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);

    const payload: Partial<Transaction> = {
      type: draft.type,
      date: draft.date,
      ticker: draft.ticker.trim().toUpperCase(),
      exchange: draft.exchange.trim().toUpperCase(),
      asset_class: draft.assetClass,
      quantity: toNumber(draft.quantity) ?? 0,
      price: isSplit ? 0 : (toNumber(draft.price) ?? 0),
      currency: draft.currency.trim().toUpperCase(),
      fee: isSplit ? 0 : (toNumber(draft.fee) ?? 0),
      fx_rate: foreign ? toNumber(draft.fxRate) : null,
      isin: draft.isin.trim(),
      name: draft.name.trim(),
      note: draft.note,
    };

    try {
      if (initial) {
        await portfolioApi.updateTransaction(initial.portfolio_id, initial.id, payload);
      } else {
        await portfolioApi.addTransaction(draft.portfolioId as number, payload);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(
        errorText(
          err,
          'Transakci se nepodařilo uložit. Zkontroluj hodnoty a zkus to znovu, nebo obnov stránku.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,21,15,0.62)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 24,
        overflowY: 'auto',
        zIndex: 120,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initial ? 'Upravit transakci' : 'Přidat transakci'}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--canvas-light)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--hairline-light)',
          padding: 28,
          width: '100%',
          maxWidth: 660,
          fontFamily: 'var(--font-body)',
          color: 'var(--ink)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24 }}>
            {initial ? 'Upravit transakci' : 'Přidat transakci'}
          </h2>
          <Button variant="outline" size="sm" onClick={onClose}>
            Zavřít
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <Select
            label="Typ transakce"
            options={TYPES.map((type) => TYPE_LABEL[type])}
            value={TYPE_LABEL[draft.type]}
            onChange={changeType}
          />
          <Input label="Datum" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          {!initial && (
            <Select
              label="Portfolio"
              options={portfolioNames}
              value={selectedPortfolio?.name ?? portfolioNames[0] ?? ''}
              onChange={(name) => {
                const match = portfolios.find((item) => item.name === name);
                set({ portfolioId: match ? match.id : null });
              }}
            />
          )}
        </div>

        <div
          style={{
            background: 'var(--surface-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--charcoal)',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4 }}>{TYPE_LABEL[draft.type]}</strong>
          {HELP[draft.type]}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <Input
            label="Ticker"
            placeholder="NVDA"
            value={draft.ticker}
            onChange={(e) => set({ ticker: e.target.value })}
          />
          <Input
            label="Burza"
            placeholder="NASDAQ"
            value={draft.exchange}
            onChange={(e) => set({ exchange: e.target.value })}
          />
          <Select
            label="Třída aktiva"
            options={CLASSES.map((item) => ASSET_CLASS_LABEL[item])}
            value={ASSET_CLASS_LABEL[draft.assetClass]}
            onChange={(label) => {
              const match = CLASSES.find((item) => ASSET_CLASS_LABEL[item] === label);
              set({ assetClass: match ?? 'STOCK' });
            }}
          />
          <Input
            label="Měna obchodu"
            placeholder="USD"
            value={draft.currency}
            onChange={(e) => set({ currency: e.target.value })}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <Input
            label={QUANTITY_LABEL[draft.type]}
            placeholder={isSplit ? '4' : '10'}
            value={draft.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
          />
          {!isSplit && (
            <Input
              label={PRICE_LABEL[draft.type]}
              placeholder={isDividend ? '42,50' : '128,40'}
              value={draft.price}
              onChange={(e) => set({ price: e.target.value })}
            />
          )}
          {!isSplit && (
            <Input
              label={FEE_LABEL[draft.type]}
              placeholder="0"
              value={draft.fee}
              onChange={(e) => set({ fee: e.target.value })}
            />
          )}
          {foreign && (
            <Input
              label={`Kurz CZK/${draft.currency.trim().toUpperCase()}`}
              placeholder="nech prázdné"
              value={draft.fxRate}
              onChange={(e) => set({ fxRate: e.target.value })}
            />
          )}
        </div>

        {!isSplit && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)', lineHeight: 1.5 }}>
            Záporný poplatek je legální zápis: sníží pořizovací cenu.
            {foreign && ' Kurz nech prázdný a doplní se kurz ČNB k datu obchodu.'}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <Input label="Název (volitelně)" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          <Input label="ISIN (volitelně)" value={draft.isin} onChange={(e) => set({ isin: e.target.value })} />
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--charcoal)', fontWeight: 600 }}>Poznámka</span>
          <textarea
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            style={NOTE_STYLE}
            placeholder="Proč jsi to koupil, co čekáš dál…"
          />
        </label>

        {error && (
          <div
            role="alert"
            style={{
              background: 'rgba(168,59,59,0.10)',
              border: '1px solid rgba(168,59,59,0.35)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              fontSize: 14,
              color: 'var(--accent-danger-text)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Zrušit
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Ukládám…' : initial ? 'Uložit změny' : 'Přidat transakci'}
          </Button>
        </div>
      </div>
    </div>
  );
}
