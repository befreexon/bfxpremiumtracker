/**
 * Adding a title to the watchlist.
 *
 * The target price is required, and the panel says why: the decision is made
 * here, calmly, in advance. Without a number this would be a wish list, and
 * the tool would have nothing to watch for.
 *
 * There is no <form> element anywhere in this layer — every control is wired
 * with onClick/onChange, so nothing can be submitted by accident.
 */

import { useState } from 'react';
import { watchlist } from '../../api/client';
import type { WatchlistItem } from '../../api/types';
import { Button, Card, Input, Select } from '../../design/components';
import { FormError, Hint, TextArea } from './fields';
import {
  ASSET_CLASS_LABELS,
  ASSET_CLASS_ORDER,
  CURRENCIES,
  assetClassFromLabel,
  errorText,
  parseNumber,
} from './shared';

const CUSTOM_GROUP = 'Vlastní skupina…';

interface AddItemPanelProps {
  groups: string[];
  onCreated: (item: WatchlistItem) => void;
  onCancel: () => void;
}

export function AddItemPanel({ groups, onCreated, onCancel }: AddItemPanelProps) {
  const groupOptions = [...groups, CUSTOM_GROUP];

  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('');
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [assetClassLabel, setAssetClassLabel] = useState(ASSET_CLASS_LABELS.STOCK);
  const [name, setName] = useState('');
  const [groupChoice, setGroupChoice] = useState(groups[0] ?? CUSTOM_GROUP);
  const [customGroup, setCustomGroup] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [note, setNote] = useState('');

  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedTicker = ticker.trim().toUpperCase();
  const trimmedExchange = exchange.trim().toUpperCase();
  const resolvedGroup = groupChoice === CUSTOM_GROUP ? customGroup.trim() : groupChoice;
  const parsedTarget = parseNumber(targetPrice);

  const tickerError = attempted && !trimmedTicker ? 'Zadej ticker, například MSFT.' : undefined;
  const exchangeError = attempted && !trimmedExchange ? 'Zadej burzu, například NASDAQ.' : undefined;
  const groupError =
    attempted && !resolvedGroup ? 'Pojmenuj skupinu, nebo vyber některou z nabídky.' : undefined;
  const targetError = attempted
    ? targetPrice.trim() === ''
      ? 'Bez cílové ceny položku uložit nelze — je to to jediné, co pak aplikace hlídá.'
      : parsedTarget === null
        ? 'Cílová cena musí být číslo, například 128,50.'
        : parsedTarget <= 0
          ? 'Cílová cena musí být větší než nula.'
          : undefined
    : undefined;

  const save = () => {
    setAttempted(true);
    setError(null);
    if (!trimmedTicker || !trimmedExchange || !resolvedGroup) return;
    if (parsedTarget === null || parsedTarget <= 0) return;

    setSaving(true);
    watchlist
      .create({
        ticker: trimmedTicker,
        exchange: trimmedExchange,
        currency: currency.trim().toUpperCase(),
        asset_class: assetClassFromLabel(assetClassLabel),
        name: name.trim(),
        group_name: resolvedGroup,
        target_price: parsedTarget,
        note: note.trim(),
      })
      .then((item) => onCreated(item))
      .catch((cause) =>
        setError(
          errorText(
            cause,
            'Titul se nepodařilo uložit. Zkontroluj ticker a burzu a zkus to znovu.',
          ),
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <Card padding={24} style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              color: 'var(--ink)',
            }}
          >
            Nový titul na watchlist
          </h2>
          <Hint>
            Rozhodnutí děláš teď, v klidu: zapiš ticker a cenu, za kterou bys ho koupil. Aplikace
            pak už jen sleduje, jestli ta cena přišla.
          </Hint>
        </div>

        {error && <FormError>{error}</FormError>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 16,
          }}
        >
          <Input
            label="Ticker"
            placeholder="MSFT"
            value={ticker}
            onChange={(event) => setTicker(event.target.value.toUpperCase())}
            error={tickerError}
          />
          <Input
            label="Burza"
            placeholder="NASDAQ"
            value={exchange}
            onChange={(event) => setExchange(event.target.value.toUpperCase())}
            error={exchangeError}
          />
          <Select label="Měna" options={CURRENCIES} value={currency} onChange={setCurrency} />
          <Select
            label="Třída aktiva"
            options={ASSET_CLASS_ORDER.map((key) => ASSET_CLASS_LABELS[key])}
            value={assetClassLabel}
            onChange={setAssetClassLabel}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          <Input
            label="Název (nepovinný)"
            placeholder="Microsoft Corporation"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div>
            <Select
              label="Skupina"
              options={groupOptions}
              value={groupChoice}
              onChange={setGroupChoice}
            />
            {groupChoice === CUSTOM_GROUP && (
              <div style={{ marginTop: 10 }}>
                <Input
                  label="Název vlastní skupiny"
                  placeholder="Cyklické tituly"
                  value={customGroup}
                  onChange={(event) => setCustomGroup(event.target.value)}
                  error={groupError}
                />
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${targetError ? 'var(--accent-danger)' : 'var(--gold)'}`,
            borderRadius: 'var(--radius-md)',
            padding: 16,
            background: 'rgba(220,180,92,0.06)',
          }}
        >
          <div style={{ maxWidth: 280 }}>
            <Input
              label="Cílová cena (povinná)"
              placeholder="128,50"
              value={targetPrice}
              onChange={(event) => setTargetPrice(event.target.value)}
              error={targetError}
            />
          </div>
          <Hint>
            Cena v měně titulu ({currency || '—'}), za kterou bys ho koupil. Je povinná záměrně:
            odděluje analýzu od impulzu. Bez ní by watchlist byl jen seznam přání a nebylo by co
            hlídat.
          </Hint>
        </div>

        <TextArea
          label="Poznámka / teze"
          placeholder="Proč tenhle titul a proč právě za tuhle cenu."
          value={note}
          onChange={setNote}
        />
        <Hint>
          Poznámka putuje s titulem dál: až ho koupíš, přenese se k pozici v portfoliu, takže si
          budeš pamatovat, proč jsi ji pořídil.
        </Hint>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Ukládám…' : 'Uložit na watchlist'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Zrušit
          </Button>
        </div>
      </div>
    </Card>
  );
}
