/**
 * „Koupil jsem" — the moment the watchlist hands a title over to the portfolio.
 *
 * Ticker, burza and měna come pre-filled from the entry, so the only things
 * left to type are the ones only the broker statement knows. On success the
 * entry is archived: it leaves the active list but keeps the record of where
 * the position came from, and the note travels with it to the transaction.
 */

import { useState } from 'react';
import { watchlist } from '../../api/client';
import type { WatchlistItem } from '../../api/types';
import { Button, Dialog, Input, Select } from '../../design/components';
import { usePortfolios } from '../../state/portfolioContext';
import { FormError, Hint, ReadOnlyPair } from './fields';
import { errorText, parseNumber, todayIso, useEscape } from './shared';

interface BuyDialogProps {
  item: WatchlistItem;
  onBought: (message: string) => void;
  onClose: () => void;
}

/** Two portfolios may share a name; the id keeps the options distinguishable. */
function optionLabels(entries: { id: number; name: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  return entries.map((entry) =>
    (counts.get(entry.name) ?? 0) > 1 ? `${entry.name} (#${entry.id})` : entry.name,
  );
}

export function BuyDialog({ item, onBought, onClose }: BuyDialogProps) {
  const { portfolios, loading: portfoliosLoading, error: portfoliosError } = usePortfolios();
  const labels = optionLabels(portfolios);

  const [portfolioLabel, setPortfolioLabel] = useState(labels[0] ?? '');
  const [date, setDate] = useState(todayIso());
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState(String(item.target_price).replace('.', ','));
  const [fee, setFee] = useState('0');
  const [fxRate, setFxRate] = useState('');

  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscape(true, onClose);

  const selectedIndex = labels.indexOf(portfolioLabel);
  const portfolio = selectedIndex >= 0 ? portfolios[selectedIndex] : portfolios[0];
  const foreignCurrency = item.currency !== 'CZK';

  const parsedQuantity = parseNumber(quantity);
  const parsedPrice = parseNumber(price);
  const parsedFee = fee.trim() === '' ? 0 : parseNumber(fee);
  const parsedFx = fxRate.trim() === '' ? null : parseNumber(fxRate);

  const quantityError = attempted
    ? parsedQuantity === null
      ? 'Zadej počet kusů, například 12 nebo 0,5.'
      : parsedQuantity <= 0
        ? 'Počet kusů musí být větší než nula.'
        : undefined
    : undefined;
  const priceError = attempted
    ? parsedPrice === null
      ? 'Zadej cenu za kus, například 128,50.'
      : parsedPrice <= 0
        ? 'Cena za kus musí být větší než nula.'
        : undefined
    : undefined;
  const feeError = attempted && parsedFee === null ? 'Poplatek musí být číslo, nebo nech prázdné.' : undefined;
  const fxError =
    attempted && fxRate.trim() !== '' && (parsedFx === null || parsedFx <= 0)
      ? 'Kurz musí být kladné číslo, například 23,40.'
      : undefined;
  const portfolioError = attempted && !portfolio ? 'Vyber portfolio, do kterého nákup patří.' : undefined;

  const confirm = () => {
    setAttempted(true);
    setError(null);
    if (!portfolio) return;
    if (parsedQuantity === null || parsedQuantity <= 0) return;
    if (parsedPrice === null || parsedPrice <= 0) return;
    if (parsedFee === null) return;
    if (fxRate.trim() !== '' && (parsedFx === null || parsedFx <= 0)) return;

    setSaving(true);
    watchlist
      .buy(item.id, {
        portfolio_id: portfolio.id,
        date,
        quantity: parsedQuantity,
        price: parsedPrice,
        fee: parsedFee,
        fx_rate: parsedFx,
      })
      .then(() =>
        onBought(
          `${item.ticker} je zapsaný jako nákup do portfolia ${portfolio.name}. Z aktivního watchlistu zmizel — je archivovaný, takže si seznam pamatuje, odkud pozice přišla. Poznámka putovala s ním k pozici.`,
        ),
      )
      .catch((cause) =>
        setError(
          errorText(
            cause,
            'Nákup se nepodařilo zapsat. Zkontroluj datum a čísla a zkus to znovu — na watchlistu zatím nic nezmizelo.',
          ),
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open title={`Koupil jsem ${item.ticker}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <ReadOnlyPair label="Ticker" value={item.ticker} />
          <ReadOnlyPair label="Burza" value={item.exchange} />
          <ReadOnlyPair label="Měna" value={item.currency} />
        </div>

        {error && <FormError>{error}</FormError>}
        {portfoliosError && <FormError>{portfoliosError}</FormError>}

        {portfoliosLoading && portfolios.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--mute)' }}>Načítám portfolia…</p>
        ) : portfolios.length === 0 ? (
          <FormError>
            Zatím nemáš žádné portfolio. Založ si jedno ve vrstvě Portfolio a pak se sem vrať —
            nákup potřebuje vědět, kam patří.
          </FormError>
        ) : (
          <div>
            <Select
              label="Portfolio"
              options={labels}
              value={portfolioLabel || labels[0]}
              onChange={setPortfolioLabel}
            />
            {portfolioError && (
              <span style={{ fontSize: 12, color: 'var(--accent-danger-text)' }}>{portfolioError}</span>
            )}
          </div>
        )}

        <Input label="Datum nákupu" type="date" value={date} onChange={(event) => setDate(event.target.value)} />

        <Input
          label="Počet kusů"
          placeholder="12"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          error={quantityError}
        />

        <div>
          <Input
            label={`Cena za kus (${item.currency})`}
            placeholder="128,50"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            error={priceError}
          />
          <Hint>Předvyplněná je cílová cena. Přepiš ji na cenu, za kterou se nákup opravdu stal.</Hint>
        </div>

        <Input
          label={`Poplatek (${item.currency})`}
          placeholder="0"
          value={fee}
          onChange={(event) => setFee(event.target.value)}
          error={feeError}
        />

        {foreignCurrency && (
          <div>
            <Input
              label="Kurz k CZK (nepovinný)"
              placeholder="23,40"
              value={fxRate}
              onChange={(event) => setFxRate(event.target.value)}
              error={fxError}
            />
            <Hint>Necháš-li prázdné, doplní se kurz ČNB k datu nákupu.</Hint>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={confirm} disabled={saving || portfolios.length === 0}>
            {saving ? 'Zapisuji…' : 'Zapsat nákup'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Zrušit
          </Button>
        </div>

        <Hint>
          Po zapsání titul zmizí z aktivního seznamu do archivu a poznámka se přenese k pozici
          v portfoliu.
        </Hint>
      </div>
    </Dialog>
  );
}
