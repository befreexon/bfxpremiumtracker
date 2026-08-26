/**
 * Tax-loss harvesting candidates: open lots sitting at an unrealized loss
 * where a sale today would still be taxable — the 3-year exemption hasn't
 * kicked in yet, so the loss could offset a taxable gain realised elsewhere
 * this year. A view of the data, not tax advice — see the panel's own copy.
 */

import { useEffect, useState } from 'react';
import { taxLoss as taxLossApi } from '../../api/client';
import type { TaxLossResponse } from '../../api/types';
import { czk, date as formatDate, quantity } from '../../lib/format';
import { CAPTION, PANEL, SECTION_TITLE, TAX_COLOR, TAX_LABEL, errorText } from './theme';

export function TaxLossHarvesting({ scopeIds }: { scopeIds: number[] | undefined }) {
  const [data, setData] = useState<TaxLossResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    taxLossApi
      .get(scopeIds)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Nepodařilo se načíst.'));
      });
    return () => {
      cancelled = true;
    };
  }, [scopeIds]);

  if (error) {
    return (
      <section style={PANEL}>
        <h3 style={SECTION_TITLE}>Daňová optimalizace ztrát</h3>
        <div style={{ color: 'var(--loss-on-dark)', fontSize: 14, marginTop: 12 }}>{error}</div>
      </section>
    );
  }

  if (!data || data.candidates.length === 0) return null;

  return (
    <section style={PANEL}>
      <h3 style={SECTION_TITLE}>Daňová optimalizace ztrát</h3>
      <p style={{ ...CAPTION, marginTop: 6, maxWidth: 640 }}>
        Tranše níž jsou dnes ve ztrátě a časový test u nich ještě neuplynul — prodej by tedy byl
        zdanitelný, a ztráta z něj může snížit letošní zdanitelný zisk z jiných prodejů (§10). Je
        to pohled na data, ne daňová rada — přesné dopady záleží na celém letošním roce a stojí za
        konzultaci s daňovým poradcem.
      </p>

      {data.taxable_gain_ytd_czk > 0 && (
        <p style={{ fontSize: 14, marginTop: 12, color: 'var(--on-dark)' }}>
          Letos už máš zdanitelný zisk{' '}
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{czk(data.taxable_gain_ytd_czk)}</strong> z
          prodejů před uplynutím časového testu.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {data.candidates.map((candidate) => (
          <div
            key={`${candidate.instrument_key}-${candidate.lot_date}`}
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, width: 72 }}>{candidate.ticker}</span>
            <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', width: 100 }}>
              {formatDate(candidate.lot_date)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--on-dark-mute)', width: 90, fontVariantNumeric: 'tabular-nums' }}>
              {quantity(candidate.quantity)} ks
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--loss-on-dark)', minWidth: 110, fontVariantNumeric: 'tabular-nums' }}>
              {czk(candidate.unrealized_loss_czk)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: TAX_COLOR[candidate.tax_test_status] }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: TAX_COLOR[candidate.tax_test_status] }} />
              {TAX_LABEL[candidate.tax_test_status]}
              {candidate.tax_test_days_remaining !== null && ` · ${candidate.tax_test_days_remaining} dní zbývá`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
