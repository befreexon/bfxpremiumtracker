/**
 * Everything behind one row of the positions table.
 *
 * A position is not one averaged number, it is a list of purchases, so the
 * detail leads with the tranches and the holding-period clock that runs on each
 * of them separately. For anything quoted in a foreign currency the result is
 * also split into what the price did and what the exchange rate did — for a
 * Czech investor in US equities that split routinely accounts for half the
 * outcome.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { portfolios as portfolioApi } from '../../api/client';
import type { Portfolio, Position, Transaction } from '../../api/types';
import { Button, Dialog } from '../../design/components';
import {
  arrowFor,
  czk,
  daysLabel,
  date as formatDate,
  money,
  MISSING,
  percent,
  quantity as formatQuantity,
  toneFor,
  TONE_COLOR_ON_DARK,
} from '../../lib/format';
import { TaxTimeline } from './TaxTimeline';
import {
  CAPTION,
  EYEBROW,
  PANEL_INSET,
  SECTION_TITLE,
  TABLE,
  TAX_COLOR,
  TAX_LABEL,
  TD,
  TD_NUM,
  TH,
  TH_NUM,
  TYPE_LABEL,
  errorText,
} from './theme';

interface PositionDetailProps {
  position: Position;
  portfolios: Portfolio[];
  /** Which portfolios the layer is currently showing; undefined means all of them. */
  scopeIds: number[] | undefined;
  taxYears: number;
  /** Bumped by the parent whenever the overview reloads, so the history follows. */
  reloadToken: number;
  narrow: boolean;
  onChanged: () => void | Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
  onAddTransaction: () => void;
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div style={PANEL_INSET}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <h4 style={{ ...SECTION_TITLE, fontSize: 15 }}>{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function Money({ value }: { value: number | null }) {
  const tone = toneFor(value);
  const arrow = arrowFor(value);
  return (
    <span style={{ color: TONE_COLOR_ON_DARK[tone], whiteSpace: 'nowrap' }}>
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {value !== null && value > 0 ? '+' : ''}
      {czk(value)}
    </span>
  );
}

export function PositionDetail({
  position,
  portfolios,
  scopeIds,
  taxYears,
  reloadToken,
  narrow,
  onChanged,
  onEditTransaction,
  onAddTransaction,
}: PositionDetailProps) {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);

  const scopeKey = scopeIds ? scopeIds.join(',') : 'all';
  const { ticker, exchange, currency } = position;

  const targets = useMemo(
    () => (scopeIds ? portfolios.filter((item) => scopeIds.includes(item.id)) : portfolios),
    [portfolios, scopeIds],
  );
  const targetKey = targets.map((item) => item.id).join(',');

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxError(null);
    try {
      const batches = await Promise.all(
        targets.map((portfolio) => portfolioApi.transactions(portfolio.id, ticker)),
      );
      const rows = batches
        .flat()
        .filter((row) => row.exchange === exchange && row.currency === currency)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
      setTransactions(rows);
      setNoteDraft(rows[0]?.note ?? '');
    } catch (err) {
      setTxError(
        errorText(
          err,
          `Historii transakcí pro ${ticker} se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.`,
        ),
      );
    } finally {
      setTxLoading(false);
    }
    // targetKey stands in for the portfolio list; the ids are what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, ticker, exchange, currency]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions, reloadToken, scopeKey]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await portfolioApi.removeTransaction(pendingDelete.portfolio_id, pendingDelete.id);
      setPendingDelete(null);
      await onChanged();
      await loadTransactions();
    } catch (err) {
      setTxError(errorText(err, 'Transakci se nepodařilo smazat. Zkus to znovu.'));
    } finally {
      setDeleting(false);
    }
  };

  const saveNote = async () => {
    const latest = transactions?.[0];
    if (!latest) return;
    setNoteSaving(true);
    setNoteMessage(null);
    try {
      await portfolioApi.updateTransaction(latest.portfolio_id, latest.id, { note: noteDraft });
      setNoteMessage('Poznámka uložena.');
      await loadTransactions();
    } catch (err) {
      setNoteMessage(errorText(err, 'Poznámku se nepodařilo uložit. Zkus to znovu.'));
    } finally {
      setNoteSaving(false);
    }
  };

  const foreign = currency !== 'CZK';
  const priceEffect = position.price_effect_czk;
  const fxEffect = position.fx_effect_czk;
  const grossMove = priceEffect !== null && fxEffect !== null ? priceEffect + fxEffect : null;
  const effectScale = Math.max(Math.abs(priceEffect ?? 0), Math.abs(fxEffect ?? 0), 1);

  const dividendTax = position.gross_dividends_czk - position.net_dividends_czk;
  const yieldOnCost =
    position.total_buy_cost_czk > 0
      ? (position.net_dividends_czk / position.total_buy_cost_czk) * 100
      : null;

  const multiPortfolio = new Set((transactions ?? []).map((row) => row.portfolio_id)).size > 1;
  const notes = (transactions ?? []).filter((row) => row.note.trim() !== '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {position.warnings.length > 0 && (
        <div
          style={{
            ...PANEL_INSET,
            borderColor: 'rgba(184,134,63,0.45)',
            background: 'rgba(184,134,63,0.10)',
            color: 'var(--on-dark)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {position.warnings.map((warning, index) => (
            <div key={index}>⚠ {warning}</div>
          ))}
        </div>
      )}

      <div style={PANEL_INSET}>
        <TaxTimeline lots={position.lots} years={taxYears} currency={currency} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        {foreign && (
          <Section title="Rozklad zisku">
            {priceEffect === null || fxEffect === null ? (
              <p style={CAPTION}>
                Rozklad nejde spočítat, protože u některé tranše chybí kurz k datu nákupu. Doplň kurz
                v transakci nebo použij tlačítko „Doplnit kurzy“.
              </p>
            ) : (
              <>
                {[
                  { label: 'Pohyb ceny', value: priceEffect, opacity: 1 },
                  { label: `Pohyb kurzu CZK/${currency}`, value: fxEffect, opacity: 0.45 },
                ].map((row) => (
                  <div key={row.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                      <span style={{ color: 'var(--on-dark)' }}>{row.label}</span>
                      <Money value={row.value} />
                    </div>
                    <div
                      style={{
                        height: 6,
                        marginTop: 6,
                        background: 'rgba(255,255,255,0.07)',
                        borderRadius: 'var(--radius-full)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(Math.abs(row.value) / effectScale) * 100}%`,
                          height: '100%',
                          background: 'var(--gold)',
                          opacity: row.opacity,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <p style={{ ...CAPTION, marginTop: 12, marginBottom: 0 }}>
                  Dohromady dávají hrubý nerealizovaný zisk {czk(grossMove)}. Poplatky, realizované
                  prodeje ani dividendy v tomto součtu nejsou.
                </p>
              </>
            )}
          </Section>
        )}

        <Section title="Dividendy">
          {position.dividends.length === 0 ? (
            <p style={CAPTION}>Zatím žádná dividenda.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <div>
                  <div style={EYEBROW}>Hrubé</div>
                  <div style={{ fontSize: 18, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {czk(position.gross_dividends_czk)}
                  </div>
                </div>
                <div>
                  <div style={EYEBROW}>Čisté</div>
                  <div style={{ fontSize: 18, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {czk(position.net_dividends_czk)}
                  </div>
                </div>
                <div>
                  <div style={EYEBROW}>Sražená daň</div>
                  <div style={{ fontSize: 15, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {czk(dividendTax)}
                  </div>
                </div>
                <div>
                  <div style={EYEBROW}>Výnos na pořizovací cenu</div>
                  <div style={{ fontSize: 15, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {percent(yieldOnCost, 2)}
                  </div>
                </div>
              </div>
              <div className="bfx-scroll" style={{ marginTop: 14 }}>
                <table style={TABLE}>
                  <thead>
                    <tr>
                      <th style={TH}>Datum</th>
                      <th style={TH_NUM}>Hrubé</th>
                      <th style={TH_NUM}>Daň</th>
                      <th style={TH_NUM}>Čisté</th>
                    </tr>
                  </thead>
                  <tbody>
                    {position.dividends.map((dividend, index) => (
                      <tr key={`${dividend.date}-${index}`}>
                        <td style={TD}>{formatDate(dividend.date)}</td>
                        <td style={TD_NUM}>{czk(dividend.gross_czk)}</td>
                        <td style={TD_NUM}>{czk(dividend.tax_czk)}</td>
                        <td style={TD_NUM}>{czk(dividend.net_czk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      </div>

      <Section title="Tranše">
        {position.lots.length === 0 ? (
          <p style={CAPTION}>Pozice je uzavřená — žádná otevřená tranše.</p>
        ) : (
          <div className="bfx-scroll">
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>Datum nákupu</th>
                  <th style={TH_NUM}>Množství</th>
                  <th style={TH_NUM}>Cena</th>
                  <th style={TH_NUM}>Kurz</th>
                  <th style={TH_NUM}>Náklad</th>
                  <th style={TH_NUM}>Hodnota</th>
                  <th style={TH_NUM}>Zisk</th>
                  <th style={TH_NUM}>Zisk %</th>
                  <th style={TH}>Časový test</th>
                </tr>
              </thead>
              <tbody>
                {position.lots.map((lot, index) => (
                  <tr key={`${lot.transaction_id ?? 'lot'}-${index}`}>
                    <td style={TD}>
                      {formatDate(lot.date)}
                      {lot.split_ratio !== 1 && (
                        <span style={{ ...CAPTION, fontSize: 11, display: 'block' }}>
                          po splitu ×{formatQuantity(lot.split_ratio)}
                        </span>
                      )}
                    </td>
                    <td style={TD_NUM}>{formatQuantity(lot.quantity)}</td>
                    <td style={TD_NUM}>{money(lot.price, currency)}</td>
                    <td style={TD_NUM}>{lot.fx_rate === null ? MISSING : lot.fx_rate.toFixed(3).replace('.', ',')}</td>
                    <td style={TD_NUM}>{czk(lot.cost_czk)}</td>
                    <td style={TD_NUM}>{czk(lot.value_czk)}</td>
                    <td style={TD_NUM}>
                      <Money value={lot.gain_czk} />
                    </td>
                    <td style={{ ...TD_NUM, color: TONE_COLOR_ON_DARK[toneFor(lot.gain_pct)] }}>
                      {percent(lot.gain_pct, 2, { withSign: true })}
                    </td>
                    <td style={TD}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius:
                              lot.tax_test_status === 'passed' ? 'var(--radius-full)' : 2,
                            background: TAX_COLOR[lot.tax_test_status],
                            display: 'inline-block',
                          }}
                        />
                        {lot.tax_test_status === 'passed'
                          ? TAX_LABEL.passed
                          : daysLabel(lot.tax_test_days_remaining)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {position.sales.length > 0 && (
        <Section title="Realizované prodeje">
          <div className="bfx-scroll">
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>Datum prodeje</th>
                  <th style={TH}>Z tranše</th>
                  <th style={TH_NUM}>Množství</th>
                  <th style={TH_NUM}>Výnos</th>
                  <th style={TH_NUM}>Náklad</th>
                  <th style={TH_NUM}>Zisk</th>
                  <th style={TH}>Držba</th>
                </tr>
              </thead>
              <tbody>
                {position.sales.map((sale, index) => (
                  <tr key={`${sale.date}-${index}`}>
                    <td style={TD}>{formatDate(sale.date)}</td>
                    <td style={TD}>{formatDate(sale.lot_date)}</td>
                    <td style={TD_NUM}>{formatQuantity(sale.quantity)}</td>
                    <td style={TD_NUM}>{czk(sale.proceeds_czk)}</td>
                    <td style={TD_NUM}>{czk(sale.cost_czk)}</td>
                    <td style={TD_NUM}>
                      <Money value={sale.gain_czk} />
                    </td>
                    <td style={TD}>
                      {daysLabel(sale.held_days)}{' '}
                      <span style={{ color: sale.tax_test_passed ? 'var(--tax-passed)' : 'var(--on-dark-mute)' }}>
                        {sale.tax_test_passed ? '· test splněn' : '· test nesplněn'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section
        title="Historie transakcí"
        action={
          <Button variant="outline-dark" size="sm" onClick={onAddTransaction}>
            Přidat transakci
          </Button>
        }
      >
        {txLoading && <p style={CAPTION}>Načítám transakce…</p>}
        {txError && (
          <p style={{ ...CAPTION, color: 'var(--loss-on-dark)' }} role="alert">
            {txError}{' '}
            <button className="bfx-link" onClick={() => void loadTransactions()}>
              Zkusit znovu
            </button>
          </p>
        )}
        {!txLoading && !txError && transactions && transactions.length === 0 && (
          <p style={CAPTION}>Ve vybraných portfoliích není k tomuto instrumentu žádná transakce.</p>
        )}
        {!txLoading && transactions && transactions.length > 0 && (
          <div className="bfx-scroll">
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>Datum</th>
                  <th style={TH}>Typ</th>
                  <th style={TH_NUM}>Množství</th>
                  <th style={TH_NUM}>Cena</th>
                  <th style={TH_NUM}>Poplatek</th>
                  <th style={TH_NUM}>Kurz</th>
                  {multiPortfolio && <th style={TH}>Portfolio</th>}
                  <th style={TH}>Akce</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((row) => (
                  <tr key={row.id}>
                    <td style={TD}>{formatDate(row.date)}</td>
                    <td style={TD}>{TYPE_LABEL[row.type]}</td>
                    <td style={TD_NUM}>{formatQuantity(row.quantity)}</td>
                    <td style={TD_NUM}>{money(row.price, row.currency)}</td>
                    <td style={TD_NUM}>{money(row.fee, row.currency)}</td>
                    <td style={TD_NUM}>
                      {row.fx_rate === null ? MISSING : row.fx_rate.toFixed(3).replace('.', ',')}
                    </td>
                    {multiPortfolio && <td style={TD}>{row.portfolio_name}</td>}
                    <td style={TD}>
                      <span style={{ display: 'inline-flex', gap: 10 }}>
                        <button className="bfx-link" onClick={() => onEditTransaction(row)}>
                          Upravit
                        </button>
                        <button className="bfx-link bfx-link-danger" onClick={() => setPendingDelete(row)}>
                          Smazat
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Poznámka">
        {notes.length > 0 && (
          <ul style={{ margin: '0 0 14px', paddingLeft: 18, ...CAPTION }}>
            {notes.map((row) => (
              <li key={row.id} style={{ marginBottom: 4 }}>
                <span style={{ color: 'var(--on-dark)' }}>{row.note}</span>{' '}
                <span>
                  — {formatDate(row.date)}, {TYPE_LABEL[row.type]}
                </span>
              </li>
            ))}
          </ul>
        )}
        {transactions && transactions.length > 0 ? (
          <>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Proč tuhle pozici držíš, kdy z ní chceš ven…"
              style={{
                width: '100%',
                minHeight: 72,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--hairline-dark)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--on-dark)',
                padding: '10px 12px',
                fontSize: 14,
                fontFamily: 'var(--font-body)',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <Button variant="outline-dark" size="sm" onClick={() => void saveNote()} disabled={noteSaving}>
                {noteSaving ? 'Ukládám…' : 'Uložit poznámku'}
              </Button>
              <span style={{ ...CAPTION, fontSize: 12 }}>
                Ukládá se k poslední transakci ({formatDate(transactions[0].date)}).
              </span>
              {noteMessage && <span style={{ ...CAPTION, fontSize: 12, color: 'var(--gold)' }}>{noteMessage}</span>}
            </div>
          </>
        ) : (
          <p style={CAPTION}>Poznámka se ukládá k transakci. Nejdřív nějakou přidej.</p>
        )}
      </Section>

      <Dialog open={pendingDelete !== null} title="Smazat transakci?" onClose={() => setPendingDelete(null)}>
        <p style={{ marginTop: 0 }}>
          {pendingDelete && (
            <>
              {TYPE_LABEL[pendingDelete.type]} {pendingDelete.ticker} z {formatDate(pendingDelete.date)},{' '}
              {formatQuantity(pendingDelete.quantity)} ks za {money(pendingDelete.price, pendingDelete.currency)}.
              Smazáním se přepočítají všechny tranše i realizované zisky.
            </>
          )}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)} disabled={deleting}>
            Ponechat
          </Button>
          <Button size="sm" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? 'Mažu…' : 'Smazat transakci'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
