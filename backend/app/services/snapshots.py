"""Monthly snapshots and the single-number benchmark.

The value chart is not reconstructed backwards. Doing so would need a historical
price for every instrument and a historical rate for every day, which is slow
and unreliable to obtain, and a chart that is quietly wrong is worse than a
chart that starts sparse. So the app records where it stands once a month and
draws the chart from those points. Thin for the first year, exact afterwards.

The benchmark answers one question, and deliberately not with a curve:

    Had every purchase gone into the index on the same dates and for the same
    amounts, the portfolio would be worth X today. It is worth Y.

The most useful answer that question can give is that stock picking is not
beating the index, which is precisely why it belongs in the tool.
"""

import logging
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.engine import fifo
from app.models import Portfolio, Snapshot, Transaction, User
from app.services import fx as fx_service

logger = logging.getLogger(__name__)


@dataclass
class BenchmarkResult:
    ticker: str
    benchmark_value_czk: float | None
    portfolio_value_czk: float
    difference_czk: float | None
    computed_at: str
    is_manual: bool = False
    note: str | None = None


def _month_key(day: date) -> date:
    return day.replace(day=1)


def record_snapshot(
    db: Session,
    portfolio: Portfolio,
    *,
    value_czk: float,
    invested_czk: float,
    benchmark_value_czk: float | None = None,
    on: date | None = None,
) -> Snapshot:
    """Stores one point per month, refreshing the current month in place."""
    on = _month_key(on or date.today())
    row = (
        db.query(Snapshot)
        .filter(Snapshot.portfolio_id == portfolio.id, Snapshot.date == on)
        .one_or_none()
    )
    if row is None:
        row = Snapshot(portfolio_id=portfolio.id, date=on)
        db.add(row)
    row.value_czk = value_czk
    row.invested_czk = invested_czk
    if benchmark_value_czk is not None:
        row.benchmark_value_czk = benchmark_value_czk
    db.commit()
    db.refresh(row)
    return row


def history(db: Session, portfolio_ids: list[int]) -> list[dict]:
    """Monthly points, summed across portfolios when several are selected."""
    rows = (
        db.query(Snapshot)
        .filter(Snapshot.portfolio_id.in_(portfolio_ids))
        .order_by(Snapshot.date)
        .all()
    )

    merged: dict[date, dict] = {}
    for row in rows:
        entry = merged.setdefault(
            row.date,
            {"date": row.date.isoformat(), "value_czk": 0.0, "invested_czk": 0.0, "benchmark_czk": None},
        )
        entry["value_czk"] += row.value_czk
        entry["invested_czk"] += row.invested_czk
        if row.benchmark_value_czk is not None:
            entry["benchmark_czk"] = (entry["benchmark_czk"] or 0.0) + row.benchmark_value_czk

    return [merged[key] for key in sorted(merged)]


def _benchmark_history(ticker: str, start: date) -> dict[date, float] | None:
    """Closing prices for the benchmark, keyed by date. None when unreachable."""
    try:
        import yfinance as yf

        frame = yf.Ticker(ticker).history(start=start.isoformat(), auto_adjust=True)
        if frame.empty:
            return None
        return {
            index.date(): float(close)
            for index, close in zip(frame.index, frame["Close"], strict=False)
        }
    except Exception as exc:
        logger.info("Historii benchmarku %s se nepodařilo načíst: %s", ticker, exc)
        return None


def _price_on_or_before(prices: dict[date, float], when: date) -> float | None:
    candidates = [day for day in prices if day <= when]
    return prices[max(candidates)] if candidates else None


def compute_benchmark(
    db: Session,
    user: User,
    transactions: list[Transaction],
    portfolio_value_czk: float,
    *,
    ticker: str | None = None,
    today: date | None = None,
) -> BenchmarkResult:
    """Replays the same cash flows into the index and values the result today."""
    today = today or date.today()
    ticker = ticker or user.benchmark_ticker

    dated = sorted([t for t in transactions if t.type in (fifo.BUY, fifo.SELL)], key=lambda t: t.date)
    if not dated:
        return BenchmarkResult(
            ticker=ticker,
            benchmark_value_czk=None,
            portfolio_value_czk=portfolio_value_czk,
            difference_czk=None,
            computed_at=today.isoformat(),
            note="Zatím nejsou žádné obchody k porovnání.",
        )

    prices = _benchmark_history(ticker, dated[0].date)
    if not prices:
        return BenchmarkResult(
            ticker=ticker,
            benchmark_value_czk=None,
            portfolio_value_czk=portfolio_value_czk,
            difference_czk=None,
            computed_at=today.isoformat(),
            note=(
                f"Historii {ticker} se nepodařilo načíst. Hodnotu benchmarku můžeš "
                f"zadat ručně."
            ),
        )

    # The index is quoted in its own currency, so each flow is converted at the
    # rate that applied on its own date — the same treatment the portfolio gets.
    units = 0.0
    for tx in dated:
        rate = tx.fx_rate if tx.currency != "CZK" else 1.0
        if rate is None:
            continue
        amount_czk = tx.quantity * tx.price * rate + (tx.fee or 0.0) * rate
        price = _price_on_or_before(prices, tx.date)
        if not price:
            continue
        benchmark_rate = fx_service.rate_to_czk(db, "EUR", tx.date, allow_fetch=False) or 1.0
        unit_cost_czk = price * benchmark_rate
        if unit_cost_czk <= 0:
            continue
        units += (amount_czk / unit_cost_czk) if tx.type == fifo.BUY else -(amount_czk / unit_cost_czk)

    latest_price = _price_on_or_before(prices, today)
    latest_rate = fx_service.rate_to_czk(db, "EUR", today, allow_fetch=False) or 1.0
    if latest_price is None:
        value = None
    else:
        value = max(units, 0.0) * latest_price * latest_rate

    return BenchmarkResult(
        ticker=ticker,
        benchmark_value_czk=value,
        portfolio_value_czk=portfolio_value_czk,
        difference_czk=(portfolio_value_czk - value) if value is not None else None,
        computed_at=today.isoformat(),
    )
