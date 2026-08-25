/**
 * Editing an entry.
 *
 * Ticker, burza and měna identify the instrument and stay fixed — changing
 * them would quietly turn one title into another. What can change is the
 * thinking: the group, the price you would pay, and the note behind it.
 */

import { useState } from 'react';
import { watchlist } from '../../api/client';
import type { WatchlistItem } from '../../api/types';
import { Button, Dialog, Input, Select } from '../../design/components';
import { FormError, Hint, ReadOnlyPair, TextArea } from './fields';
import { errorText, parseNumber, useEscape } from './shared';

const CUSTOM_GROUP = 'Vlastní skupina…';

interface EditDialogProps {
  item: WatchlistItem;
  groups: string[];
  onSaved: (item: WatchlistItem) => void;
  onClose: () => void;
}

export function EditDialog({ item, groups, onSaved, onClose }: EditDialogProps) {
  const knownGroups = groups.includes(item.group_name) ? groups : [item.group_name, ...groups];
  const groupOptions = [...knownGroups, CUSTOM_GROUP];

  const [name, setName] = useState(item.name);
  const [groupChoice, setGroupChoice] = useState(item.group_name);
  const [customGroup, setCustomGroup] = useState('');
  const [targetPrice, setTargetPrice] = useState(String(item.target_price).replace('.', ','));
  const [note, setNote] = useState(item.note);

  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscape(true, onClose);

  const resolvedGroup = groupChoice === CUSTOM_GROUP ? customGroup.trim() : groupChoice;
  const parsedTarget = parseNumber(targetPrice);

  const groupError =
    attempted && !resolvedGroup ? 'Pojmenuj skupinu, nebo vyber některou z nabídky.' : undefined;
  const targetError = attempted
    ? targetPrice.trim() === ''
      ? 'Cílová cena je povinná — bez ní není co hlídat.'
      : parsedTarget === null
        ? 'Cílová cena musí být číslo, například 128,50.'
        : parsedTarget <= 0
          ? 'Cílová cena musí být větší než nula.'
          : undefined
    : undefined;

  const save = () => {
    setAttempted(true);
    setError(null);
    if (!resolvedGroup || parsedTarget === null || parsedTarget <= 0) return;

    setSaving(true);
    watchlist
      .update(item.id, {
        name: name.trim(),
        group_name: resolvedGroup,
        target_price: parsedTarget,
        note: note.trim(),
      })
      .then((updated) => onSaved(updated))
      .catch((cause) =>
        setError(errorText(cause, 'Změny se nepodařilo uložit. Zkus to znovu za okamžik.')),
      )
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open title={`Upravit ${item.ticker}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <ReadOnlyPair label="Ticker" value={item.ticker} />
          <ReadOnlyPair label="Burza" value={item.exchange} />
          <ReadOnlyPair label="Měna" value={item.currency} />
        </div>

        {error && <FormError>{error}</FormError>}

        <Input
          label="Název"
          placeholder="Microsoft Corporation"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <div>
          <Select label="Skupina" options={groupOptions} value={groupChoice} onChange={setGroupChoice} />
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

        <div>
          <Input
            label={`Cílová cena (${item.currency})`}
            placeholder="128,50"
            value={targetPrice}
            onChange={(event) => setTargetPrice(event.target.value)}
            error={targetError}
          />
          <Hint>Cena, za kterou bys titul koupil. Měnit ji jde, ale je to nové rozhodnutí.</Hint>
        </div>

        <TextArea label="Poznámka / teze" value={note} onChange={setNote} rows={4} />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Ukládám…' : 'Uložit změny'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Zrušit
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
