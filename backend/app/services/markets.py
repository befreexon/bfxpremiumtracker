"""A small, fixed set of market-overview quotes — a few major indices, two
commodities, Bitcoin, and two FX pairs — independent of the portfolio
instrument model, since none of these are things a user holds a position in.

Best-effort only, like the rest of this app's price fetching: yfinance is a
scrape target, not a guaranteed feed. A symbol that fails to resolve is
reported with a null price and an error, never a fabricated number.
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# (key, Czech label, Yahoo symbol, quote currency)
WATCHLIST: list[tuple[str, str, str, str]] = [
    ("sp500", "S&P 500", "^GSPC", "USD"),
    ("nasdaq", "Nasdaq", "^IXIC", "USD"),
    ("dow", "Dow Jones", "^DJI", "USD"),
    ("crude_oil", "Ropa (WTI)", "CL=F", "USD"),
    ("gold", "Zlato", "GC=F", "USD"),
    ("bitcoin", "Bitcoin", "BTC-USD", "USD"),
    ("eurusd", "EUR/USD", "EURUSD=X", "USD"),
    ("usdczk", "USD/CZK", "USDCZK=X", "CZK"),
]


@dataclass
class MarketQuote:
    key: str
    label: str
    price: float | None
    change_pct: float | None
    currency: str | None
    error: str | None = None


def build_quote(
    key: str, label: str, currency: str, price: float | None, previous_close: float | None
) -> MarketQuote:
    """Pure so the day-change math is testable without a network call."""
    if price is None:
        return MarketQuote(key=key, label=label, price=None, change_pct=None, currency=currency, error="Cena nedostupná.")
    change_pct = (price / previous_close - 1.0) * 100.0 if previous_close else None
    return MarketQuote(key=key, label=label, price=price, change_pct=change_pct, currency=currency)


def _fetch_one(key: str, label: str, symbol: str, currency: str):
    try:
        import yfinance as yf

        info = yf.Ticker(symbol).fast_info
        price = info.get("last_price") if hasattr(info, "get") else getattr(info, "last_price", None)
        previous_close = (
            info.get("previous_close") if hasattr(info, "get") else getattr(info, "previous_close", None)
        )
        if price is None or previous_close is None:
            history = yf.Ticker(symbol).history(period="5d")
            if not history.empty:
                closes = history["Close"]
                if price is None:
                    price = float(closes.iloc[-1])
                if previous_close is None and len(closes) > 1:
                    previous_close = float(closes.iloc[-2])
        return build_quote(
            key, label, currency,
            float(price) if price is not None else None,
            float(previous_close) if previous_close is not None else None,
        )
    except Exception as exc:  # network, symbol, or upstream schema change
        logger.info("Trh %s (%s) se nepodařilo načíst: %s", label, symbol, exc)
        return MarketQuote(key=key, label=label, price=None, change_pct=None, currency=currency, error="Cena nedostupná.")


def fetch_overview() -> list[MarketQuote]:
    return [_fetch_one(key, label, symbol, currency) for key, label, symbol, currency in WATCHLIST]
