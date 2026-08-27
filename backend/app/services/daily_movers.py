"""Today's biggest movers among current holdings — the same day-change
technique the Trhy page uses for indices (today's price against the
previous close), just for what's actually held. Always a live fetch, one
call per holding, so it is triggered explicitly rather than baked into
every overview load.
"""

import logging
from dataclasses import dataclass

from app.services.prices import yahoo_symbol

logger = logging.getLogger(__name__)


@dataclass
class Mover:
    instrument_key: str
    ticker: str
    currency: str | None
    price: float | None
    move_pct: float | None
    move_czk: float | None
    error: str | None = None


def compute_move(
    key: str,
    ticker: str,
    currency: str | None,
    price: float | None,
    previous_close: float | None,
    quantity: float,
    fx_rate: float | None,
) -> Mover:
    """Pure so the day-change math is testable without a network call."""
    if price is None or not previous_close:
        return Mover(
            instrument_key=key, ticker=ticker, currency=currency, price=None,
            move_pct=None, move_czk=None, error="Dnešní pohyb nedostupný.",
        )
    price = float(price)
    previous_close = float(previous_close)
    move_pct = (price / previous_close - 1.0) * 100.0
    move_czk = (price - previous_close) * quantity * fx_rate if fx_rate is not None else None
    return Mover(instrument_key=key, ticker=ticker, currency=currency, price=price, move_pct=move_pct, move_czk=move_czk)


def _fetch_one(ticker: str, exchange: str, currency: str, asset_class: str, quantity: float, fx_rate: float | None) -> Mover:
    key = f"{ticker}|{exchange}|{currency}"
    symbol = yahoo_symbol(ticker, exchange, asset_class)
    try:
        import yfinance as yf

        info = yf.Ticker(symbol).fast_info
        price = info.get("last_price") if hasattr(info, "get") else getattr(info, "last_price", None)
        previous_close = (
            info.get("previous_close") if hasattr(info, "get") else getattr(info, "previous_close", None)
        )
        return compute_move(key, ticker, currency, price, previous_close, quantity, fx_rate)
    except Exception as exc:  # network, symbol, or upstream schema change
        logger.info("Dnešní pohyb pro %s se nepodařilo zjistit: %s", symbol, exc)
        return Mover(
            instrument_key=key, ticker=ticker, currency=currency, price=None,
            move_pct=None, move_czk=None, error="Dnešní pohyb nedostupný.",
        )


def build_movers(holdings: list[dict]) -> list[Mover]:
    """``holdings``: one dict per open position — ticker, exchange, currency,
    asset_class, quantity, fx_rate (today's market rate, for converting the
    native-currency move to CZK)."""
    return [_fetch_one(**holding) for holding in holdings]
