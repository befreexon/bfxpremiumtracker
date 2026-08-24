"""Current instrument prices.

Quality of automatically fetched prices varies — good for large US listings,
worse for European ETFs — so a hand-entered price always wins and is marked as
such in the UI. When a price cannot be found the position is reported without
one. It is never filled in with a zero or with the purchase price: both look
like real numbers and would quietly corrupt the portfolio total, the weights and
the concentration warning.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import PRICE_CACHE_TTL, PRICE_CACHE_TTL_CRYPTO
from app.models import ManualPrice, PriceCache

logger = logging.getLogger(__name__)

# yfinance suffixes by exchange. LSE listings come back in pence, which is
# exactly the GBX the engine expects — no conversion here.
EXCHANGE_SUFFIX = {
    "NASDAQ": "",
    "NYSE": "",
    "AMEX": "",
    "ARCA": "",
    "XETRA": ".DE",
    "FRA": ".F",
    "LSE": ".L",
    "PSE": ".PR",  # Prague
    "WSE": ".WA",
    "SIX": ".SW",
    "EURONEXT": ".AS",
    "MIL": ".MI",
    "TSX": ".TO",
}


@dataclass
class Quote:
    instrument_key: str
    price: float | None
    currency: str | None = None
    source: str = "yfinance"
    as_of: datetime | None = None
    is_manual: bool = False
    error: str | None = None


def yahoo_symbol(ticker: str, exchange: str, asset_class: str = "STOCK") -> str:
    """Maps our ticker+exchange pair onto a Yahoo symbol."""
    ticker = ticker.strip().upper()
    exchange = (exchange or "").strip().upper()
    if asset_class == "CRYPTO" or exchange == "CRYPTO":
        return ticker if "-" in ticker else f"{ticker}-USD"
    return f"{ticker}{EXCHANGE_SUFFIX.get(exchange, '')}"


def _ttl_for(asset_class: str) -> int:
    return PRICE_CACHE_TTL_CRYPTO if asset_class == "CRYPTO" else PRICE_CACHE_TTL


def _is_fresh(row: PriceCache, asset_class: str) -> bool:
    fetched = row.fetched_at
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched < timedelta(seconds=_ttl_for(asset_class))


def fetch_quote(ticker: str, exchange: str, asset_class: str = "STOCK") -> tuple[float | None, str | None]:
    """One live lookup. Returns (price, currency); (None, None) if not found."""
    symbol = yahoo_symbol(ticker, exchange, asset_class)
    try:
        import yfinance as yf

        info = yf.Ticker(symbol).fast_info
        price = info.get("last_price") if hasattr(info, "get") else getattr(info, "last_price", None)
        currency = info.get("currency") if hasattr(info, "get") else getattr(info, "currency", None)
        if price is None:
            history = yf.Ticker(symbol).history(period="5d")
            if not history.empty:
                price = float(history["Close"].iloc[-1])
        if price is None:
            return None, None
        return float(price), (str(currency).upper() if currency else None)
    except Exception as exc:  # network, symbol, or upstream schema change
        logger.info("Cenu pro %s se nepodařilo dohledat: %s", symbol, exc)
        return None, None


def get_prices(
    db: Session,
    user_id: int,
    instruments: list[tuple[str, str, str, str]],
    *,
    force_refresh: bool = False,
    allow_fetch: bool = True,
) -> dict[str, Quote]:
    """Resolves prices for (ticker, exchange, currency, asset_class) tuples.

    Order of precedence: a manual price, then a fresh cached price, then a live
    lookup, then nothing.
    """
    manual_rows = (
        db.query(ManualPrice).filter(ManualPrice.user_id == user_id).all()
    )
    manual = {row.instrument_key: row for row in manual_rows}

    quotes: dict[str, Quote] = {}
    for ticker, exchange, currency, asset_class in instruments:
        key = f"{ticker}|{exchange}|{currency}"
        if key in quotes:
            continue

        if key in manual:
            row = manual[key]
            quotes[key] = Quote(
                instrument_key=key,
                price=row.price,
                currency=currency,
                source="manual",
                as_of=row.set_at,
                is_manual=True,
            )
            continue

        cached = db.get(PriceCache, key)
        if cached and not force_refresh and _is_fresh(cached, asset_class):
            quotes[key] = Quote(
                instrument_key=key,
                price=cached.price,
                currency=cached.currency,
                source=cached.source,
                as_of=cached.fetched_at,
            )
            continue

        if not allow_fetch:
            quotes[key] = Quote(
                instrument_key=key,
                price=cached.price if cached else None,
                currency=cached.currency if cached else None,
                as_of=cached.fetched_at if cached else None,
                error=None if cached else "Cena nebyla dosud dohledána.",
            )
            continue

        price, quoted_currency = fetch_quote(ticker, exchange, asset_class)
        if price is None:
            # Keep serving the stale value rather than nothing, but say so.
            quotes[key] = Quote(
                instrument_key=key,
                price=cached.price if cached else None,
                currency=cached.currency if cached else None,
                as_of=cached.fetched_at if cached else None,
                error="Cena se nenašla. Zadej ji ručně nebo zkus aktualizaci znovu.",
            )
            continue

        if cached is None:
            cached = PriceCache(instrument_key=key, price=price, currency=quoted_currency or currency)
            db.add(cached)
        else:
            cached.price = price
            cached.currency = quoted_currency or currency
            cached.fetched_at = datetime.now(timezone.utc)
        db.commit()

        quotes[key] = Quote(
            instrument_key=key,
            price=price,
            currency=quoted_currency or currency,
            as_of=cached.fetched_at,
        )

    return quotes


def set_manual_price(db: Session, user_id: int, instrument_key: str, price: float) -> ManualPrice:
    row = (
        db.query(ManualPrice)
        .filter(ManualPrice.user_id == user_id, ManualPrice.instrument_key == instrument_key)
        .one_or_none()
    )
    if row is None:
        row = ManualPrice(user_id=user_id, instrument_key=instrument_key, price=price)
        db.add(row)
    else:
        row.price = price
        row.set_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


def clear_manual_price(db: Session, user_id: int, instrument_key: str) -> None:
    """Hands the instrument back to automatic pricing."""
    db.query(ManualPrice).filter(
        ManualPrice.user_id == user_id, ManualPrice.instrument_key == instrument_key
    ).delete()
    db.commit()
