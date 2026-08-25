"""Lot-level position engine.

A position is not one averaged number, it is a list of purchase lots. Each lot
keeps its own price, its own FX rate and its own date, because all three are
needed later: the date drives the holding-period test, the FX rate drives the
split of the result into price and currency, and collapsing them into a single
average destroys both. Sales consume the oldest lot first.

Fees are taken to be in the currency of the trade. A negative fee reduces the
cost basis — that is how an assigned short put is recorded, where the real cost
is the strike less the premium collected.
"""

from dataclasses import dataclass, field
from datetime import date

from app.engine.currency import BASE_CURRENCY, normalize_currency_code

BUY = "BUY"
SELL = "SELL"
DIV = "DIV"
ADJUST = "ADJUST"
TRANSACTION_TYPES = (BUY, SELL, DIV, ADJUST)


@dataclass
class TxInput:
    """A transaction as the engine needs it, decoupled from the ORM."""

    id: int | None
    type: str
    date: date
    quantity: float
    price: float
    currency: str
    fee: float = 0.0
    fx_rate: float | None = None
    note: str = ""

    def effective_fx(self) -> float | None:
        """CZK per unit of the quoted currency, or None when still unknown."""
        if normalize_currency_code(self.currency) == BASE_CURRENCY:
            return 1.0
        return self.fx_rate


@dataclass
class Lot:
    """One purchase, or what is left of it."""

    quantity: float
    price: float  # per unit, in the quoted currency
    fx_rate: float | None  # CZK per quoted unit, at purchase
    date: date
    fee_czk: float = 0.0  # the part of the purchase fee still attached
    original_quantity: float = 0.0
    transaction_id: int | None = None
    split_ratio: float = 1.0  # cumulative effect of ADJUST events, for display

    def gross_cost_czk(self) -> float | None:
        if self.fx_rate is None:
            return None
        return self.quantity * self.price * self.fx_rate

    def cost_czk(self) -> float | None:
        gross = self.gross_cost_czk()
        if gross is None:
            return None
        return gross + self.fee_czk


@dataclass
class RealizedSale:
    date: date
    quantity: float
    lot_date: date
    proceeds_czk: float
    cost_czk: float
    gain_czk: float
    sell_price: float
    lot_price: float
    held_days: int
    transaction_id: int | None = None


@dataclass
class DividendRecord:
    date: date
    gross_czk: float
    tax_czk: float
    net_czk: float
    transaction_id: int | None = None


@dataclass
class SplitRecord:
    date: date
    ratio: float
    transaction_id: int | None = None


@dataclass
class EngineResult:
    lots: list[Lot] = field(default_factory=list)
    sales: list[RealizedSale] = field(default_factory=list)
    dividends: list[DividendRecord] = field(default_factory=list)
    splits: list[SplitRecord] = field(default_factory=list)
    #: Cost basis of everything ever bought, including parts since sold. Used as
    #: the denominator for the return of a fully closed position.
    closed_cost_czk: float = 0.0
    #: Transactions the engine could not express in CZK for lack of an FX rate.
    #: The ids point the user at the offending rows; the flag is what the rest of
    #: the code tests, because a transaction without an id is just as unusable.
    missing_fx_transaction_ids: list[int] = field(default_factory=list)
    has_missing_fx: bool = False
    warnings: list[str] = field(default_factory=list)

    @property
    def quantity(self) -> float:
        return sum(lot.quantity for lot in self.lots)

    @property
    def realized_gain_czk(self) -> float:
        return sum(sale.gain_czk for sale in self.sales)

    @property
    def net_dividends_czk(self) -> float:
        return sum(div.net_czk for div in self.dividends)

    @property
    def gross_dividends_czk(self) -> float:
        return sum(div.gross_czk for div in self.dividends)

    @property
    def open_cost_czk(self) -> float:
        return sum(lot.cost_czk() or 0.0 for lot in self.lots)

    @property
    def open_gross_cost_czk(self) -> float:
        return sum(lot.gross_cost_czk() or 0.0 for lot in self.lots)

    @property
    def open_fees_czk(self) -> float:
        return sum(lot.fee_czk for lot in self.lots)

    @property
    def average_price(self) -> float | None:
        """Weighted average purchase price of the open lots, in quoted currency."""
        qty = self.quantity
        if qty <= 0:
            return None
        return sum(lot.quantity * lot.price for lot in self.lots) / qty


class InsufficientHoldingsError(ValueError):
    """Raised when a sale exceeds what was held at that moment."""

    def __init__(self, requested: float, available: float, when: date):
        self.requested = requested
        self.available = available
        self.when = when
        super().__init__(
            f"K {when.isoformat()} je k dispozici {available:g} ks, "
            f"prodej žádá {requested:g} ks."
        )


def _sort_key(tx: TxInput) -> tuple:
    """Chronological, with a deliberate order within a single day.

    A split comes first: on its effective date the holding is already the
    post-split count, so a sale that day sells post-split shares — and a
    purchase that day buys them, which is why the new lot must land *after* the
    ratio has been applied and not be adjusted a second time. A purchase then
    precedes a sale so that same-day round trips have something to sell.
    """
    type_rank = {ADJUST: 0, BUY: 1, DIV: 2, SELL: 3}
    return (tx.date, type_rank.get(tx.type, 9), tx.id or 0)


def run(transactions: list[TxInput], *, strict: bool = True) -> EngineResult:
    """Replays an instrument's transactions into lots, sales and dividends."""
    result = EngineResult()
    lots: list[Lot] = result.lots

    for tx in sorted(transactions, key=_sort_key):
        fx = tx.effective_fx()

        if tx.type == BUY:
            _apply_buy(result, tx, fx)
        elif tx.type == SELL:
            _apply_sell(result, tx, fx, strict=strict)
        elif tx.type == DIV:
            _apply_dividend(result, tx, fx)
        elif tx.type == ADJUST:
            _apply_split(result, tx)
        else:
            result.warnings.append(f"Neznámý typ transakce: {tx.type}")

    # Lots emptied by sales are dropped, but a rounding remnant should not
    # survive as a phantom fraction of a share.
    result.lots[:] = [lot for lot in lots if lot.quantity > 1e-12]
    return result


def _apply_buy(result: EngineResult, tx: TxInput, fx: float | None) -> None:
    if fx is None:
        _note_missing_fx(result, tx)
    result.lots.append(
        Lot(
            quantity=tx.quantity,
            price=tx.price,
            fx_rate=fx,
            date=tx.date,
            fee_czk=(tx.fee * fx) if fx is not None else 0.0,
            original_quantity=tx.quantity,
            transaction_id=tx.id,
        )
    )


def _note_missing_fx(result: EngineResult, tx: TxInput) -> None:
    result.has_missing_fx = True
    if tx.id is not None:
        result.missing_fx_transaction_ids.append(tx.id)


def _consume_lots(result: EngineResult, quantity: float) -> None:
    """Removes shares FIFO without booking a result.

    Used when a sale cannot be valued in CZK: the holding must still shrink, or
    every later number about this position would be wrong too.
    """
    remaining = quantity
    for lot in result.lots:
        if remaining <= 1e-12:
            break
        taken = min(lot.quantity, remaining)
        lot.fee_czk -= lot.fee_czk * (taken / lot.quantity) if lot.quantity else 0.0
        lot.quantity -= taken
        remaining -= taken


def _apply_sell(result: EngineResult, tx: TxInput, fx: float | None, *, strict: bool) -> None:
    if fx is None:
        # Consume the lots so the share count stays right, but record no
        # realised result. Valuing the proceeds at a rate of zero would book the
        # entire cost basis as a loss — a fabricated number that looks real and
        # would flow straight into the portfolio total.
        _note_missing_fx(result, tx)
        result.warnings.append(
            f"{tx.date.isoformat()}: prodej bez kurzu k datu obchodu, "
            f"realizovaný zisk se nepočítá. Doplň kurz."
        )
        _consume_lots(result, min(tx.quantity, sum(lot.quantity for lot in result.lots)))
        return

    available = sum(lot.quantity for lot in result.lots)
    if tx.quantity - available > 1e-9:
        if strict:
            raise InsufficientHoldingsError(tx.quantity, available, tx.date)
        result.warnings.append(
            f"{tx.date.isoformat()}: prodej {tx.quantity:g} ks převyšuje držených "
            f"{available:g} ks, prodáno jen dostupné množství."
        )

    remaining = min(tx.quantity, available)
    if remaining <= 0:
        return

    sell_fx = fx
    total_sell_qty = remaining
    sell_fee_czk = tx.fee * sell_fx

    for lot in result.lots:
        if remaining <= 1e-12:
            break
        if lot.quantity <= 1e-12:
            continue

        taken = min(lot.quantity, remaining)
        share_of_lot = taken / lot.quantity

        lot_gross_cost = taken * lot.price * (lot.fx_rate or 0.0)
        lot_fee_share = lot.fee_czk * share_of_lot
        cost_czk = lot_gross_cost + lot_fee_share

        share_of_sale = taken / total_sell_qty
        proceeds_czk = taken * tx.price * sell_fx - sell_fee_czk * share_of_sale

        result.sales.append(
            RealizedSale(
                date=tx.date,
                quantity=taken,
                lot_date=lot.date,
                proceeds_czk=proceeds_czk,
                cost_czk=cost_czk,
                gain_czk=proceeds_czk - cost_czk,
                sell_price=tx.price,
                lot_price=lot.price,
                held_days=(tx.date - lot.date).days,
                transaction_id=tx.id,
            )
        )
        result.closed_cost_czk += cost_czk

        lot.quantity -= taken
        lot.fee_czk -= lot_fee_share
        remaining -= taken


def _apply_dividend(result: EngineResult, tx: TxInput, fx: float | None) -> None:
    """`price` carries the gross total for the whole payment, `fee` the tax withheld."""
    if fx is None:
        _note_missing_fx(result, tx)
        return

    gross_czk = tx.price * fx
    tax_czk = tx.fee * fx
    result.dividends.append(
        DividendRecord(
            date=tx.date,
            gross_czk=gross_czk,
            tax_czk=tax_czk,
            net_czk=gross_czk - tax_czk,
            transaction_id=tx.id,
        )
    )


def _apply_split(result: EngineResult, tx: TxInput) -> None:
    """`quantity` carries the ratio: 4 for a 4:1 split, 0.25 for a 1:4 reverse.

    Share count is multiplied and purchase price divided, so the total cost basis
    is untouched — a split hands out no money and costs none.
    """
    ratio = tx.quantity
    if ratio <= 0:
        result.warnings.append(
            f"{tx.date.isoformat()}: split s poměrem {ratio:g} je neplatný, přeskočeno."
        )
        return
    if abs(ratio - 1.0) < 1e-12:
        result.warnings.append(
            f"{tx.date.isoformat()}: split s poměrem 1 nic nemění, přeskočeno."
        )
        return

    for lot in result.lots:
        lot.quantity *= ratio
        lot.price /= ratio
        lot.original_quantity *= ratio
        lot.split_ratio *= ratio

    result.splits.append(SplitRecord(date=tx.date, ratio=ratio, transaction_id=tx.id))
