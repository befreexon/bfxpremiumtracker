/**
 * Deleting an entry for good.
 *
 * Worth one question first, because deleting is not the same as archiving:
 * the record of when the title was noticed and at what price disappears with
 * it, and with it the answer to "how would that purchase have turned out".
 */

import { useState } from 'react';
import { watchlist } from '../../api/client';
import type { WatchlistItem } from '../../api/types';
import { Button, Dialog } from '../../design/components';
import { FormError } from './fields';
import { errorText, useEscape } from './shared';

interface ConfirmDeleteDialogProps {
  item: WatchlistItem;
  onDeleted: (message: string) => void;
  onClose: () => void;
}

export function ConfirmDeleteDialog({ item, onDeleted, onClose }: ConfirmDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscape(true, onClose);

  const remove = () => {
    setError(null);
    setDeleting(true);
    watchlist
      .remove(item.id)
      .then(() => onDeleted(`${item.ticker} byl z watchlistu smazán.`))
      .catch((cause) =>
        setError(errorText(cause, 'Položku se nepodařilo smazat. Zkus to znovu za okamžik.')),
      )
      .finally(() => setDeleting(false));
  };

  return (
    <Dialog open title={`Smazat ${item.ticker}?`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <FormError>{error}</FormError>}

        <p style={{ margin: 0 }}>
          Smazáním zmizí i záznam o tom, kdy jsi titul zapsal a za kolik se tehdy obchodoval — tedy
          i to, jak by ten nákup dopadl.
        </p>
        <p style={{ margin: 0, color: 'var(--mute)', fontSize: 14 }}>
          Pokud jsi titul koupil, použij radši „Koupil jsem". Tím se položka archivuje a historie
          zůstane zachovaná.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="dark" onClick={remove} disabled={deleting}>
            {deleting ? 'Mažu…' : 'Smazat natrvalo'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Zrušit
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
