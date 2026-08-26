"""Sector/industry/country per instrument, for the portfolio-wide
diversification breakdown. Cached like a price (see app.services.prices) but
for much longer, since a company's sector rarely changes — and best-effort in
exactly the same way: a lookup that fails leaves the instrument with no
classification, sorted into "Neznámý sektor" rather than a guess.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import InstrumentInfo
from app.services.prices import yahoo_symbol

logger = logging.getLogger(__name__)

CLASSIFICATION_CACHE_TTL_DAYS = 30


@dataclass
class Classification:
    sector: str | None
    industry: str | None
    country: str | None


def _is_fresh(row: InstrumentInfo) -> bool:
    fetched = row.fetched_at
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched < timedelta(days=CLASSIFICATION_CACHE_TTL_DAYS)


def _fetch_one(ticker: str, exchange: str, asset_class: str) -> Classification:
    symbol = yahoo_symbol(ticker, exchange, asset_class)
    try:
        import yfinance as yf

        info = yf.Ticker(symbol).info or {}
        return Classification(
            sector=info.get("sector") or None,
            industry=info.get("industry") or None,
            country=info.get("country") or None,
        )
    except Exception as exc:  # network, symbol, or upstream schema change
        logger.info("Klasifikaci pro %s se nepodařilo dohledat: %s", symbol, exc)
        return Classification(sector=None, industry=None, country=None)


def get_classifications(
    db: Session,
    instruments: list[tuple[str, str, str, str]],  # ticker, exchange, currency, asset_class
    allow_fetch: bool = True,
) -> dict[str, Classification]:
    result: dict[str, Classification] = {}
    for ticker, exchange, currency, asset_class in instruments:
        key = f"{ticker}|{exchange}|{currency}"
        row = db.get(InstrumentInfo, key)
        if row is not None and _is_fresh(row):
            result[key] = Classification(sector=row.sector, industry=row.industry, country=row.country)
            continue
        if not allow_fetch:
            if row is not None:
                result[key] = Classification(sector=row.sector, industry=row.industry, country=row.country)
            continue

        classification = _fetch_one(ticker, exchange, asset_class)
        if row is None:
            row = InstrumentInfo(instrument_key=key)
            db.add(row)
        row.sector = classification.sector
        row.industry = classification.industry
        row.country = classification.country
        row.fetched_at = datetime.now(timezone.utc)
        result[key] = classification

    db.commit()
    return result
