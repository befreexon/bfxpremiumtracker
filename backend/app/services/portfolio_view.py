"""Assembles the on-screen portfolio from stored transactions, prices and rates."""

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.engine import fifo
from app.engine.fifo import TxInput
from app.engine.positions import (
    AllocationSlice,
    PortfolioView,
    PositionView,
    build_portfolio,
    build_position,
)
from app.engine.xirr import CashFlow
from app.models import Portfolio, Segment, SegmentMember, Transaction, User
from app.services import fx as fx_service
from app.services import prices as price_service
from app.services import snapshots as snapshot_service

DIVIDEND_HORIZON_DAYS = 90


def _to_tx_input(row: Transaction) -> TxInput:
    return TxInput(
        id=row.id,
        type=row.type,
        date=row.date,
        quantity=row.quantity,
        price=row.price,
        currency=row.currency,
        fee=row.fee or 0.0,
        fx_rate=row.fx_rate,
        note=row.note or "",
    )


def load_transactions(
    db: Session, user: User, portfolio_ids: list[int] | None = None
) -> list[Transaction]:
    query = (
        db.query(Transaction)
        .join(Portfolio)
        .filter(Portfolio.user_id == user.id)
    )
    if portfolio_ids:
        query = query.filter(Transaction.portfolio_id.in_(portfolio_ids))
    return query.order_by(Transaction.date, Transaction.id).all()


def build_view(
    db: Session,
    user: User,
    *,
    portfolio_ids: list[int] | None = None,
    today: date | None = None,
    allow_fetch: bool = True,
    force_refresh: bool = False,
) -> PortfolioView:
    """The full portfolio picture: positions, totals, allocation, warnings."""
    today = today or date.today()
    rows = load_transactions(db, user, portfolio_ids)

    grouped: dict[str, list[Transaction]] = defaultdict(list)
    for row in rows:
        grouped[row.instrument_key].append(row)

    instruments = [
        (rows_[0].ticker, rows_[0].exchange, rows_[0].currency, rows_[0].asset_class)
        for rows_ in grouped.values()
    ]
    quotes = price_service.get_prices(
        db, user.id, instruments, allow_fetch=allow_fetch, force_refresh=force_refresh
    )

    currencies = {row.currency for row in rows}
    current_rates = fx_service.rates_for_currencies(
        db, currencies, today, allow_fetch=allow_fetch
    )

    positions: list[PositionView] = []
    for key, tx_rows in grouped.items():
        quote = quotes.get(key)
        first = tx_rows[0]
        name = next((r.name for r in tx_rows if r.name), "")

        position = build_position(
            ticker=first.ticker,
            exchange=first.exchange,
            currency=first.currency,
            asset_class=first.asset_class,
            name=name,
            transactions=[_to_tx_input(r) for r in tx_rows],
            current_price=quote.price if quote else None,
            current_fx=current_rates.get(first.currency),
            price_is_manual=bool(quote and quote.is_manual),
            price_as_of=quote.as_of.isoformat() if quote and quote.as_of else None,
            today=today,
            tax_test_years=user.tax_test_years,
            strict=False,
        )
        if quote and quote.error and position.missing_price:
            position.warnings.append(quote.error)
        positions.append(position)

    positions.sort(key=lambda p: (p.total_gain_czk is None, -(p.total_gain_czk or 0.0)))

    view = build_portfolio(
        positions, today=today, xirr_flows=_portfolio_cash_flows(rows)
    )
    view.upcoming_dividends = upcoming_dividends(grouped, today)

    resolved_ids = portfolio_ids or [
        p.id for p in db.query(Portfolio).filter(Portfolio.user_id == user.id)
    ]
    _fill_ytd_return(db, view, rows, resolved_ids, today)
    _fill_segment_allocation(db, view, user)
    return view


def _fill_segment_allocation(db: Session, view: PortfolioView, user: User) -> None:
    """The user's own custom breakdown ("Vlastní rozdělení"), alongside the
    built-in ones by class/currency/instrument. Empty until they define at
    least one segment; positions with no assignment fall into "Nezařazeno"."""
    segments = (
        db.query(Segment)
        .filter(Segment.user_id == user.id)
        .order_by(Segment.sort_order, Segment.id)
        .all()
    )
    if not segments:
        return

    members = db.query(SegmentMember).filter(SegmentMember.user_id == user.id).all()
    segment_of = {member.instrument_key: member.segment_id for member in members}

    totals: dict[int, float] = {}
    unassigned = 0.0
    for position in view.positions:
        if not position.value_czk:
            continue
        segment_id = segment_of.get(position.instrument_key)
        if segment_id is not None:
            totals[segment_id] = totals.get(segment_id, 0.0) + position.value_czk
        else:
            unassigned += position.value_czk

    total = view.value_czk or 0.0
    slices = [
        AllocationSlice(
            label=segment.name,
            value_czk=totals[segment.id],
            weight=(totals[segment.id] / total if total else 0.0),
            color=segment.color,
        )
        for segment in segments
        if totals.get(segment.id)
    ]
    if unassigned:
        slices.append(
            AllocationSlice(
                label="Nezařazeno",
                value_czk=unassigned,
                weight=(unassigned / total if total else 0.0),
                color=None,
            )
        )
    slices.sort(key=lambda item: -item.value_czk)
    view.allocation_by_segment = slices


def _fill_ytd_return(
    db: Session,
    view: PortfolioView,
    rows: list[Transaction],
    portfolio_ids: list[int],
    today: date,
) -> None:
    """Return since the earliest snapshot dated this year.

    Not annualised, and not day-weighted like the portfolio XIRR — a plain
    Simple Dietz split of the period into "what was already there" (the
    snapshot) and "what moved during the period" (this year's own flows). It
    exists only because there is no honest way to know what the portfolio was
    worth on 1 January without either a stored snapshot or reconstructing
    historical prices, which this app deliberately does not do.
    """
    anchor = snapshot_service.earliest_value_this_year(db, portfolio_ids, today.year)
    if anchor is None:
        view.ytd_unavailable_reason = (
            "Chybí snapshot z letošního roku. Ulož ho v záložce Pohledy — "
            "napříště se z něj YTD zhodnocení spočítá."
        )
        return

    anchor_date, anchor_value = anchor
    invested = 0.0
    withdrawn = 0.0
    incomplete = False

    for row in rows:
        if row.date < anchor_date:
            continue
        fx = _to_tx_input(row).effective_fx()
        if fx is None:
            incomplete = True
            continue
        if row.type == fifo.BUY:
            invested += row.quantity * row.price * fx + (row.fee or 0.0) * fx
        elif row.type == fifo.SELL:
            withdrawn += row.quantity * row.price * fx - (row.fee or 0.0) * fx
        elif row.type == fifo.DIV:
            withdrawn += (row.price - (row.fee or 0.0)) * fx

    view.ytd_gain_czk = view.value_czk + withdrawn - invested - anchor_value
    denominator = anchor_value + invested
    view.ytd_gain_pct = (
        view.ytd_gain_czk / denominator * 100.0 if denominator > 0 else None
    )
    view.ytd_basis_date = anchor_date.isoformat()
    if incomplete:
        view.warnings.append(
            "YTD zhodnocení nezahrnuje transakce bez známého kurzu k datu obchodu."
        )


def _portfolio_cash_flows(rows: list[Transaction]) -> list[CashFlow]:
    """Every dated movement of the user's own money, for the portfolio XIRR."""
    flows: list[CashFlow] = []
    for row in rows:
        tx = _to_tx_input(row)
        rate = tx.effective_fx()
        if rate is None:
            continue
        if row.type == fifo.BUY:
            flows.append(CashFlow(row.date, -(row.quantity * row.price * rate + (row.fee or 0) * rate)))
        elif row.type == fifo.SELL:
            flows.append(CashFlow(row.date, row.quantity * row.price * rate - (row.fee or 0) * rate))
        elif row.type == fifo.DIV:
            flows.append(CashFlow(row.date, (row.price - (row.fee or 0)) * rate))
    return flows


def upcoming_dividends(
    grouped: dict[str, list[Transaction]], today: date
) -> list[dict]:
    """Projects the next payment for instruments that have paid before.

    Cadence is inferred from the gaps between past payments, so this is an
    estimate from history and is labelled as one — not a company announcement.
    """
    upcoming: list[dict] = []

    for key, rows in grouped.items():
        dividends = sorted(
            [r for r in rows if r.type == fifo.DIV], key=lambda r: r.date
        )
        if len(dividends) < 2:
            continue

        gaps = [
            (dividends[i].date - dividends[i - 1].date).days
            for i in range(1, len(dividends))
        ]
        # A median-ish gap is steadier than a mean when one payment was skipped.
        average_gap = sorted(gaps)[len(gaps) // 2]
        if average_gap <= 0:
            continue

        last = dividends[-1]
        expected = last.date + timedelta(days=average_gap)
        while expected < today:
            expected += timedelta(days=average_gap)
        if (expected - today).days > DIVIDEND_HORIZON_DAYS:
            continue

        current_quantity = fifo.run(
            [_to_tx_input(r) for r in rows], strict=False
        ).quantity
        if current_quantity <= 0:
            continue

        quantity_then = fifo.run(
            [_to_tx_input(r) for r in rows if r.date <= last.date], strict=False
        ).quantity
        rate = last.fx_rate if last.currency != "CZK" else 1.0

        estimated = None
        if quantity_then > 0 and rate:
            per_share = (last.price - (last.fee or 0.0)) / quantity_then
            estimated = per_share * current_quantity * rate

        upcoming.append(
            {
                "instrument_key": key,
                "ticker": last.ticker,
                "expected_date": expected.isoformat(),
                "days_away": (expected - today).days,
                "estimated_net_czk": estimated,
                "based_on_payments": len(dividends),
                "cadence_days": average_gap,
            }
        )

    upcoming.sort(key=lambda item: item["days_away"])
    return upcoming
