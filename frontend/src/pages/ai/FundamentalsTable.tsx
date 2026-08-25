/**
 * The fundamentals as they came out of the data source.
 *
 * A missing value is not a zero and is not rendered as one: absent metrics are
 * pulled out of the table and listed separately, so nothing in the table is a
 * placeholder. Each row carries a one-line Czech note about what the number
 * means, because a P/B on a software company and a P/B on a bank are not the
 * same statement.
 */

import { MISSING } from '../../lib/format';
import {
  bigMoneyText,
  fractionAsPercentText,
  multipleText,
  normaliseDividendYield,
  numberText,
} from './formatting';
import { percent } from '../../lib/format';
import { Chip, DARK, Eyebrow, Panel, ScrollArea } from './primitives';
import type { AiFundamentals } from './types';

interface FundamentalRow {
  key: keyof AiFundamentals;
  label: string;
  hint: string;
  format: (value: number, currency: string | null) => string;
}

const ROWS: FundamentalRow[] = [
  {
    key: 'market_cap',
    label: 'Tržní kapitalizace',
    hint: 'Cena všech akcií dohromady.',
    format: (value, currency) => bigMoneyText(value, currency),
  },
  {
    key: 'trailing_pe',
    label: 'P/E (trailing)',
    hint: 'Kolikanásobek posledního ročního zisku trh platí.',
    format: (value) => multipleText(value, 1),
  },
  {
    key: 'forward_pe',
    label: 'P/E (forward)',
    hint: 'Totéž proti očekávanému zisku příštího roku.',
    format: (value) => multipleText(value, 1),
  },
  {
    key: 'peg',
    label: 'PEG',
    hint: 'P/E dělené růstem zisku. Pod 1 se za růst neplatí prémie.',
    format: (value) => multipleText(value),
  },
  {
    key: 'price_to_book',
    label: 'P/B',
    hint: 'Cena proti účetní hodnotě. U firem bez hmotného majetku málo vypovídající.',
    format: (value) => multipleText(value),
  },
  {
    key: 'price_to_sales',
    label: 'P/S',
    hint: 'Cena proti tržbám. Užitečné u firem, které ještě nejsou ziskové.',
    format: (value) => multipleText(value, 1),
  },
  {
    key: 'ev_to_ebitda',
    label: 'EV/EBITDA',
    hint: 'Zahrnuje dluh, srovnává napříč různě zadluženými firmami.',
    format: (value) => multipleText(value, 1),
  },
  {
    key: 'ev_to_fcf',
    label: 'EV/FCF',
    hint: 'Hodnota firmy proti hotovosti, která jí skutečně zbude.',
    format: (value) => multipleText(value, 1),
  },
  {
    key: 'earnings_yield',
    label: 'Earnings yield',
    hint: 'Převrácená hodnota P/E — kolik procent ceny je roční zisk.',
    format: (value) => percent(value, 2),
  },
  {
    key: 'fcf_yield',
    label: 'FCF výnos',
    hint: 'Volný cash flow proti tržní kapitalizaci.',
    format: (value) => percent(value, 2),
  },
  {
    key: 'profit_margin',
    label: 'Čistá marže',
    hint: 'Kolik z tržeb zůstane jako čistý zisk.',
    format: (value) => fractionAsPercentText(value),
  },
  {
    key: 'roe',
    label: 'ROE',
    hint: 'Návratnost vlastního kapitálu. Čti spolu se zadlužením.',
    format: (value) => fractionAsPercentText(value),
  },
  {
    key: 'roa',
    label: 'ROA',
    hint: 'Návratnost celkových aktiv, bez ohledu na to, jak jsou financovaná.',
    format: (value) => fractionAsPercentText(value),
  },
  {
    key: 'revenue_growth',
    label: 'Růst tržeb',
    hint: 'Meziroční změna tržeb.',
    format: (value) => fractionAsPercentText(value),
  },
  {
    key: 'earnings_growth',
    label: 'Růst zisku',
    hint: 'Meziroční změna zisku.',
    format: (value) => fractionAsPercentText(value),
  },
  {
    key: 'debt_to_equity',
    label: 'Dluh / vlastní kapitál',
    hint: 'Zdroj udává v procentech: 150 % znamená dluh 1,5násobek kapitálu.',
    format: (value) => percent(value, 1),
  },
  {
    key: 'current_ratio',
    label: 'Běžná likvidita',
    hint: 'Kolikrát krátkodobá aktiva pokrývají krátkodobé závazky.',
    format: (value) => multipleText(value),
  },
  {
    key: 'free_cash_flow',
    label: 'Volný cash flow',
    hint: 'Hotovost, která firmě zbude po investicích.',
    format: (value, currency) => bigMoneyText(value, currency),
  },
  {
    key: 'dividend_yield',
    label: 'Dividendový výnos',
    hint: 'Roční dividenda proti ceně akcie.',
    format: (value) => percent(normaliseDividendYield(value), 2),
  },
  {
    key: 'payout_ratio',
    label: 'Výplatní poměr',
    hint: 'Podíl zisku vyplácený na dividendách.',
    format: (value) => fractionAsPercentText(value),
  },
  {
    key: 'beta',
    label: 'Beta',
    hint: 'Citlivost na pohyb trhu. 1 = pohybuje se s trhem.',
    format: (value) => numberText(value),
  },
];

export function FundamentalsTable({
  fundamentals,
  currency,
}: {
  fundamentals: AiFundamentals;
  currency: string | null;
}) {
  const present = ROWS.filter((row) => {
    const value = fundamentals[row.key];
    return value !== null && value !== undefined && Number.isFinite(value);
  });
  const absent = ROWS.filter((row) => !present.includes(row));

  return (
    <Panel
      title="Fundamenty"
      subtitle="Načteno z Yahoo Finance beze změny. Ukazatel, který se nepodařilo získat, v tabulce není — nula by tvrdila něco jiného než chybějící údaj."
    >
      {present.length === 0 ? (
        <div style={{ fontSize: 14, color: DARK.mute }}>
          Nepodařilo se načíst žádný fundamentální ukazatel. Analýza výše stojí jen na ceně a
          technice.
        </div>
      ) : (
        <ScrollArea minWidth={460}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
            <tbody>
              {present.map((row) => (
                <tr key={String(row.key)} style={{ borderBottom: `1px solid ${DARK.divider}` }}>
                  <th
                    scope="row"
                    style={{
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: 14,
                      color: DARK.text,
                      padding: '11px 12px 11px 0',
                      verticalAlign: 'top',
                    }}
                  >
                    {row.label}
                    <div style={{ fontWeight: 400, fontSize: 12, color: DARK.faint, marginTop: 3, maxWidth: '52ch' }}>
                      {row.hint}
                    </div>
                  </th>
                  <td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 15,
                      color: DARK.text,
                      padding: '11px 0',
                      whiteSpace: 'nowrap',
                      verticalAlign: 'top',
                    }}
                  >
                    {row.format(fundamentals[row.key] as number, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {absent.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Eyebrow>Nedostupné ukazatele ({MISSING})</Eyebrow>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {absent.map((row) => (
              <Chip key={String(row.key)}>
                {row.label} {MISSING}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
