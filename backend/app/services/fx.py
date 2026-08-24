"""Exchange rates against CZK, sourced from the Czech National Bank.

Two rules govern this module:

* A rate fetched for a past date is written once and never rewritten. The rate
  that applied on the trade date is a fact about that trade; letting it drift
  would silently rewrite the cost basis of every foreign position.
* A rate that cannot be determined is returned as None. Never a 1.0, never
  yesterday's rate quietly relabelled.

The CNB fixing lists some currencies per 100 units (JPY, HUF) — the "amount"
column has to be divided out, or those positions come out a hundred times too
large.
"""

import logging
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from app.engine.currency import (
    BASE_CURRENCY,
    is_minor_unit,
    major_currency,
    minor_factor,
    normalize_currency_code,
)
from app.models import FxRate

logger = logging.getLogger(__name__)

CNB_DAILY_URL = (
    "https://www.cnb.cz/en/financial-markets/foreign-exchange-market/"
    "central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt"
)
REQUEST_TIMEOUT = 8.0
# The fixing is published on working days only; a weekend trade uses the last
# published rate, so we walk back a few days before giving up.
MAX_LOOKBACK_DAYS = 7


class RatesUnavailable(RuntimeError):
    """The rate table could not be reached at all."""


def parse_cnb_table(text: str) -> dict[str, float]:
    """Parses the CNB fixing into CZK per one unit of each currency.

        24 Aug 2026 #163
        Country|Currency|Amount|Code|Rate
        Japan|yen|100|JPY|14.782
    """
    rates: dict[str, float] = {}
    for line in text.splitlines()[2:]:
        parts = line.strip().split("|")
        if len(parts) < 5:
            continue
        try:
            amount = float(parts[2].replace(",", "."))
            code = parts[3].strip().upper()
            rate = float(parts[4].replace(",", "."))
        except ValueError:
            continue
        if amount > 0:
            rates[code] = rate / amount
    return rates


def fetch_cnb_rates(on: date) -> dict[str, float]:
    """Downloads the fixing for a date. Raises RatesUnavailable if unreachable."""
    try:
        response = httpx.get(
            CNB_DAILY_URL,
            params={"date": on.strftime("%d.%m.%Y")},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RatesUnavailable(str(exc)) from exc

    rates = parse_cnb_table(response.text)
    if not rates:
        raise RatesUnavailable("Kurzovní lístek ČNB nešlo přečíst.")
    return rates


def _stored_rate(db: Session, currency: str, on: date) -> float | None:
    row = db.get(FxRate, (currency, on))
    return row.rate if row else None


def _store_rates(db: Session, on: date, rates: dict[str, float]) -> None:
    """Writes rates for a date, leaving any already-stored value untouched."""
    for code, rate in rates.items():
        if db.get(FxRate, (code, on)) is None:
            db.add(FxRate(currency=code, date=on, rate=rate))
    if db.get(FxRate, (BASE_CURRENCY, on)) is None:
        db.add(FxRate(currency=BASE_CURRENCY, date=on, rate=1.0))
    db.commit()


def rate_to_czk(
    db: Session, currency: str, on: date | None = None, *, allow_fetch: bool = True
) -> float | None:
    """CZK per one unit of `currency` on `on`, or None if it cannot be resolved.

    Minor units are derived from their major currency, so GBX comes back as a
    hundredth of the GBP rate rather than being looked up on its own.
    """
    currency = normalize_currency_code(currency)
    if currency == BASE_CURRENCY:
        return 1.0

    on = on or date.today()
    lookup_code = major_currency(currency)
    factor = minor_factor(currency) if is_minor_unit(currency) else 1.0

    # Walk back over weekends and holidays to the last published fixing.
    for offset in range(MAX_LOOKBACK_DAYS + 1):
        day = on - timedelta(days=offset)
        stored = _stored_rate(db, lookup_code, day)
        if stored is not None:
            return stored * factor

    if not allow_fetch:
        return None

    for offset in range(MAX_LOOKBACK_DAYS + 1):
        day = on - timedelta(days=offset)
        try:
            rates = fetch_cnb_rates(day)
        except RatesUnavailable:
            logger.info("Kurzovní lístek ČNB pro %s není dostupný.", day)
            continue
        _store_rates(db, day, rates)
        if lookup_code in rates:
            return rates[lookup_code] * factor

    return None


def rates_for_currencies(
    db: Session, currencies: set[str], on: date | None = None, *, allow_fetch: bool = True
) -> dict[str, float | None]:
    return {
        currency: rate_to_czk(db, currency, on, allow_fetch=allow_fetch)
        for currency in currencies
    }


def set_manual_rate(db: Session, currency: str, on: date, rate: float) -> FxRate:
    """Stores a hand-entered rate, overwriting whatever was there.

    This is the one path allowed to replace a historical rate, because it is the
    user correcting the record rather than a fetch drifting it.
    """
    currency = normalize_currency_code(major_currency(currency))
    row = db.get(FxRate, (currency, on))
    if row is None:
        row = FxRate(currency=currency, date=on, rate=rate, source="manual")
        db.add(row)
    else:
        row.rate = rate
        row.source = "manual"
        row.fetched_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row
