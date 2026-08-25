"""Turning replayed transactions into the numbers shown on screen.

Two similar-looking percentages live here and must never be confused:

* **Celkový zisk %** — everything: price, currency, dividends, fees, realised
  gains from partial sales. This is the answer to "did I make money on this".
* **Pohyb ceny %** — the instrument's own price move since purchase, with no
  currency effect and no dividends.

They are labelled separately everywhere because two similar percentages side by
side with no caption is where people misread their own portfolio.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.engine import fifo
from app.engine.currency import BASE_CURRENCY, normalize_currency_code
from app.engine.fifo import EngineResult, TxInput
from app.engine.xirr import CashFlow, xirr

# Holding-period colour thresholds, in days remaining.
TAX_TEST_SOON_DAYS = 90
TAX_TEST_APPROACHING_DAYS = 365
CONCENTRATION_LIMIT = 0.25


@dataclass
class LotView:
    quantity: float
    price: float
    fx_rate: float | None
    date: date
    cost_czk: float | None
    value_czk: float | None
    gain_czk: float | None
    gain_pct: float | None
    tax_test_days_remaining: int | None
    tax_test_status: str
    split_ratio: float = 1.0
    transaction_id: int | None = None


@dataclass
class PositionView:
    ticker: str
    exchange: str
    currency: str
    asset_class: str
    name: str = ""

    quantity: float = 0.0
    average_price: float | None = None
    current_price: float | None = None
    price_is_manual: bool = False
    price_as_of: str | None = None
    fx_rate: float | None = None

    cost_czk: float = 0.0  # open lots
    total_buy_cost_czk: float = 0.0  # everything ever bought, incl. sold parts
    value_czk: float | None = None

    unrealized_gain_czk: float | None = None
    realized_gain_czk: float = 0.0
    gross_dividends_czk: float = 0.0
    net_dividends_czk: float = 0.0

    total_gain_czk: float | None = None
    total_gain_pct: float | None = None
    price_move_pct: float | None = None

    price_effect_czk: float | None = None
    fx_effect_czk: float | None = None

    weight: float | None = None
    xirr: float | None = None

    lots: list[LotView] = field(default_factory=list)
    sales: list[dict] = field(default_factory=list)
    dividends: list[dict] = field(default_factory=list)
    splits: list[dict] = field(default_factory=list)

    missing_price: bool = False
    missing_fx: bool = False
    warnings: list[str] = field(default_factory=list)

    @property
    def instrument_key(self) -> str:
        return f"{self.ticker}|{self.exchange}|{self.currency}"


@dataclass
class AllocationSlice:
    label: str
    value_czk: float
    weight: float


@dataclass
class PortfolioView:
    value_czk: float = 0.0
    invested_czk: float = 0.0  # everything ever put in
    withdrawn_czk: float = 0.0  # sale proceeds plus net dividends
    total_gain_czk: float = 0.0
    total_gain_pct: float | None = None
    realized_gain_czk: float = 0.0
    net_dividends_czk: float = 0.0
    xirr: float | None = None

    positions: list[PositionView] = field(default_factory=list)
    allocation_by_class: list[AllocationSlice] = field(default_factory=list)
    allocation_by_currency: list[AllocationSlice] = field(default_factory=list)
    allocation_by_instrument: list[AllocationSlice] = field(default_factory=list)
    concentration_warnings: list[dict] = field(default_factory=list)
    upcoming_dividends: list[dict] = field(default_factory=list)

    #: Open positions, and the same count split by asset class (e.g. {"STOCK": 16, "ETF": 2}).
    position_count: int = 0
    position_count_by_class: dict[str, int] = field(default_factory=dict)

    #: Sum of sale proceeds from SELL transactions dated this calendar year.
    ytd_sales_volume_czk: float = 0.0
    #: Whether every sale realised this year had already passed the holding-period
    #: test. None when there were no sales this year — the question does not apply.
    ytd_sales_tax_exempt: bool | None = None

    #: Return since the nearest snapshot dated in the current year, computed the
    #: same way as the portfolio XIRR (see services.portfolio_view), just not
    #: annualised — a period return, not a rate. None without such a snapshot,
    #: because there is no other way to know what the portfolio was worth on
    #: 1 January without reconstructing historical prices, which this app does
    #: not do.
    ytd_gain_czk: float | None = None
    ytd_gain_pct: float | None = None
    ytd_basis_date: str | None = None
    ytd_unavailable_reason: str | None = None

    positions_missing_price: list[str] = field(default_factory=list)
    positions_missing_fx: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def tax_test_status(days_remaining: int | None) -> str:
    if days_remaining is None:
        return "unknown"
    if days_remaining <= 0:
        return "passed"
    if days_remaining <= TAX_TEST_SOON_DAYS:
        return "soon"
    if days_remaining <= TAX_TEST_APPROACHING_DAYS:
        return "approaching"
    return "far"


def _days_until_tax_test(lot_date: date, today: date, years: int) -> int:
    """Days left before the holding-period exemption applies to this lot.

    Calendar arithmetic, so a lot bought on 29 February matures on 1 March.
    """
    try:
        matures = lot_date.replace(year=lot_date.year + years)
    except ValueError:
        matures = lot_date.replace(year=lot_date.year + years, day=28) + timedelta(days=1)
    return (matures - today).days


def build_position(
    *,
    ticker: str,
    exchange: str,
    currency: str,
    asset_class: str,
    transactions: list[TxInput],
    current_price: float | None,
    current_fx: float | None,
    name: str = "",
    price_is_manual: bool = False,
    price_as_of: str | None = None,
    today: date | None = None,
    tax_test_years: int = 3,
    strict: bool = False,
) -> PositionView:
    today = today or date.today()
    currency = normalize_currency_code(currency)

    engine: EngineResult = fifo.run(transactions, strict=strict)

    if normalize_currency_code(currency) == BASE_CURRENCY:
        current_fx = 1.0

    view = PositionView(
        ticker=ticker,
        exchange=exchange,
        currency=currency,
        asset_class=asset_class,
        name=name,
        price_is_manual=price_is_manual,
        price_as_of=price_as_of,
        current_price=current_price,
        fx_rate=current_fx,
        warnings=list(engine.warnings),
    )

    view.quantity = engine.quantity
    view.average_price = engine.average_price
    view.cost_czk = engine.open_cost_czk
    view.total_buy_cost_czk = engine.open_cost_czk + engine.closed_cost_czk
    view.realized_gain_czk = engine.realized_gain_czk
    view.gross_dividends_czk = engine.gross_dividends_czk
    view.net_dividends_czk = engine.net_dividends_czk
    view.missing_fx = engine.has_missing_fx
    view.missing_price = current_price is None and engine.quantity > 0

    if current_price is not None and current_fx is not None:
        view.value_czk = engine.quantity * current_price * current_fx
        view.unrealized_gain_czk = view.value_czk - engine.open_cost_czk
        view.price_effect_czk, view.fx_effect_czk = _decompose(
            engine, current_price, current_fx
        )
        if view.average_price:
            view.price_move_pct = (current_price / view.average_price - 1.0) * 100.0
    elif engine.quantity <= 0:
        # Fully closed: no market value to find, the result is already realised.
        view.value_czk = 0.0
        view.unrealized_gain_czk = 0.0

    if view.missing_fx:
        # A lot bought without a known rate contributes nothing to the cost
        # basis, so every figure derived from it would be understated. Better to
        # show nothing and say why than to show a number that looks right.
        view.cost_czk = 0.0
        view.total_buy_cost_czk = 0.0
        view.unrealized_gain_czk = None
        view.price_effect_czk = None
        view.fx_effect_czk = None
        view.warnings.append(
            "U některé transakce chybí kurz k datu obchodu, zisk se proto nepočítá. "
            "Doplň kurzy a čísla se dopočítají."
        )
    elif view.unrealized_gain_czk is not None:
        view.total_gain_czk = (
            view.unrealized_gain_czk + view.realized_gain_czk + view.net_dividends_czk
        )
        denominator = view.total_buy_cost_czk
        if denominator > 0:
            view.total_gain_pct = view.total_gain_czk / denominator * 100.0

    view.lots = [
        _lot_view(lot, current_price, current_fx, today, tax_test_years)
        for lot in engine.lots
    ]
    view.sales = [
        {
            "date": sale.date.isoformat(),
            "quantity": sale.quantity,
            "lot_date": sale.lot_date.isoformat(),
            "proceeds_czk": sale.proceeds_czk,
            "cost_czk": sale.cost_czk,
            "gain_czk": sale.gain_czk,
            "held_days": sale.held_days,
            "tax_test_passed": sale.held_days >= tax_test_years * 365,
        }
        for sale in engine.sales
    ]
    view.dividends = [
        {
            "date": div.date.isoformat(),
            "gross_czk": div.gross_czk,
            "tax_czk": div.tax_czk,
            "net_czk": div.net_czk,
        }
        for div in engine.dividends
    ]
    view.splits = [
        {"date": split.date.isoformat(), "ratio": split.ratio} for split in engine.splits
    ]

    view.xirr = _position_xirr(transactions, view, today)
    return view


def _lot_view(
    lot: fifo.Lot,
    current_price: float | None,
    current_fx: float | None,
    today: date,
    tax_test_years: int,
) -> LotView:
    cost = lot.cost_czk()
    value = None
    gain = None
    gain_pct = None
    if current_price is not None and current_fx is not None:
        value = lot.quantity * current_price * current_fx
        if cost is not None:
            gain = value - cost
            gain_pct = (gain / cost * 100.0) if cost else None

    days_remaining = _days_until_tax_test(lot.date, today, tax_test_years)
    return LotView(
        quantity=lot.quantity,
        price=lot.price,
        fx_rate=lot.fx_rate,
        date=lot.date,
        cost_czk=cost,
        value_czk=value,
        gain_czk=gain,
        gain_pct=gain_pct,
        tax_test_days_remaining=days_remaining,
        tax_test_status=tax_test_status(days_remaining),
        split_ratio=lot.split_ratio,
        transaction_id=lot.transaction_id,
    )


def _decompose(
    engine: EngineResult, current_price: float, current_fx: float
) -> tuple[float | None, float | None]:
    """Splits the unrealised move into what the price did and what the rate did.

        price effect    = qty * (price_now - price_paid) * rate_paid
        currency effect = qty * price_now * (rate_now - rate_paid)

    The two add up to the gross gain by construction. For a Czech investor
    holding US equities this split routinely accounts for half the result, and
    almost no tracker shows it.
    """
    price_effect = 0.0
    fx_effect = 0.0
    for lot in engine.lots:
        if lot.fx_rate is None:
            return None, None
        price_effect += lot.quantity * (current_price - lot.price) * lot.fx_rate
        fx_effect += lot.quantity * current_price * (current_fx - lot.fx_rate)
    return price_effect, fx_effect


def _position_xirr(
    transactions: list[TxInput], view: PositionView, today: date
) -> float | None:
    flows: list[CashFlow] = []
    for tx in transactions:
        fx = tx.effective_fx()
        if fx is None:
            return None
        if tx.type == fifo.BUY:
            flows.append(CashFlow(tx.date, -(tx.quantity * tx.price * fx + tx.fee * fx)))
        elif tx.type == fifo.SELL:
            flows.append(CashFlow(tx.date, tx.quantity * tx.price * fx - tx.fee * fx))
        elif tx.type == fifo.DIV:
            flows.append(CashFlow(tx.date, (tx.price - tx.fee) * fx))

    if view.value_czk is not None and view.quantity > 0:
        flows.append(CashFlow(today, view.value_czk))
    return xirr(flows)


def build_portfolio(
    positions: list[PositionView], *, today: date | None = None, xirr_flows: list[CashFlow] | None = None
) -> PortfolioView:
    today = today or date.today()
    view = PortfolioView(positions=positions)

    for position in positions:
        view.value_czk += position.value_czk or 0.0
        view.invested_czk += position.total_buy_cost_czk
        view.realized_gain_czk += position.realized_gain_czk
        view.net_dividends_czk += position.net_dividends_czk
        if position.missing_price:
            view.positions_missing_price.append(position.instrument_key)
        if position.missing_fx:
            view.positions_missing_fx.append(position.instrument_key)
        if position.quantity > 1e-9:
            view.position_count += 1
            view.position_count_by_class[position.asset_class] = (
                view.position_count_by_class.get(position.asset_class, 0) + 1
            )

    proceeds = sum(
        sale["proceeds_czk"] for position in positions for sale in position.sales
    )
    view.withdrawn_czk = proceeds + view.net_dividends_czk
    view.total_gain_czk = view.value_czk + view.withdrawn_czk - view.invested_czk
    if view.invested_czk > 0:
        view.total_gain_pct = view.total_gain_czk / view.invested_czk * 100.0

    _fill_allocation(view)
    _fill_concentration(view)
    _fill_ytd_sales(view, today)

    if xirr_flows:
        flows = list(xirr_flows)
        if view.value_czk:
            flows.append(CashFlow(today, view.value_czk))
        view.xirr = xirr(flows)

    if view.positions_missing_price:
        view.warnings.append(
            "U některých pozic chybí aktuální cena. Hodnota portfolia je bez nich."
        )
    if view.positions_missing_fx:
        view.warnings.append(
            "U některých transakcí chybí kurz k datu obchodu. Doplň ho, jinak se pozice nezapočítá."
        )
    return view


def _fill_allocation(view: PortfolioView) -> None:
    by_class: dict[str, float] = {}
    by_currency: dict[str, float] = {}
    for position in view.positions:
        if not position.value_czk:
            continue
        by_class[position.asset_class] = by_class.get(position.asset_class, 0.0) + position.value_czk
        by_currency[position.currency] = (
            by_currency.get(position.currency, 0.0) + position.value_czk
        )

    total = view.value_czk or 0.0
    view.allocation_by_class = [
        AllocationSlice(label=label, value_czk=value, weight=(value / total if total else 0.0))
        for label, value in sorted(by_class.items(), key=lambda kv: -kv[1])
    ]
    view.allocation_by_currency = [
        AllocationSlice(label=label, value_czk=value, weight=(value / total if total else 0.0))
        for label, value in sorted(by_currency.items(), key=lambda kv: -kv[1])
    ]
    view.allocation_by_instrument = [
        AllocationSlice(
            label=position.ticker,
            value_czk=position.value_czk,
            weight=(position.value_czk / total if total else 0.0),
        )
        for position in sorted(
            (p for p in view.positions if p.value_czk), key=lambda p: -p.value_czk
        )
    ]

    for position in view.positions:
        if position.value_czk and total:
            position.weight = position.value_czk / total


def _fill_ytd_sales(view: PortfolioView, today: date) -> None:
    """This year's realised sales: how much, and whether all of it was already
    exempt from tax on the day it was sold."""
    year_prefix = str(today.year)
    ytd_sales = [
        sale
        for position in view.positions
        for sale in position.sales
        if sale["date"].startswith(year_prefix)
    ]
    if not ytd_sales:
        return
    view.ytd_sales_volume_czk = sum(sale["proceeds_czk"] for sale in ytd_sales)
    view.ytd_sales_tax_exempt = all(sale["tax_test_passed"] for sale in ytd_sales)


def _cs(value: float, decimals: int = 1) -> str:
    """A number for a Czech sentence — decimal comma, not a point."""
    return f"{value:.{decimals}f}".replace(".", ",")


def _fill_concentration(view: PortfolioView) -> None:
    for position in view.positions:
        if position.weight and position.weight > CONCENTRATION_LIMIT:
            view.concentration_warnings.append(
                {
                    "instrument_key": position.instrument_key,
                    "ticker": position.ticker,
                    "weight": position.weight,
                    "message": (
                        f"{position.ticker} tvoří {_cs(position.weight * 100)} % portfolia "
                        f"(hranice {CONCENTRATION_LIMIT * 100:.0f} %)."
                    ),
                }
            )
