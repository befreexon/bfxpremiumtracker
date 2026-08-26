"""ORM models.

An instrument is identified by the triple ticker + exchange + currency:
AAPL|NASDAQ|USD and APC|XETRA|EUR are two different records for the same company.
That triple is stored on every transaction and watchlist item rather than in a
separate instruments table, so an import can never half-create an instrument.
"""

import datetime as dt
from datetime import timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> dt.datetime:
    return dt.datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)

    # Tax-test settings live per user: the holding period and the exemption cap
    # both changed in recent years and will change again.
    tax_test_years: Mapped[int] = mapped_column(Integer, default=3)
    tax_exempt_cap_czk: Mapped[float] = mapped_column(Float, default=40_000_000.0)
    benchmark_ticker: Mapped[str] = mapped_column(String(32), default="VWCE")

    portfolios: Mapped[list["Portfolio"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    watchlist: Mapped[list["WatchlistItem"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="portfolios")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_portfolio_user_name"),)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(
        ForeignKey("portfolios.id", ondelete="CASCADE"), index=True
    )

    type: Mapped[str] = mapped_column(String(8))  # BUY | SELL | DIV | ADJUST
    date: Mapped[dt.date] = mapped_column(Date, index=True)

    ticker: Mapped[str] = mapped_column(String(32), index=True)
    exchange: Mapped[str] = mapped_column(String(16))
    asset_class: Mapped[str] = mapped_column(String(16))  # STOCK | ETF | CRYPTO
    currency: Mapped[str] = mapped_column(String(8))

    # For DIV, price carries the gross total and quantity is 1.
    # For ADJUST, quantity carries the split ratio (4 = 4:1, 0.25 = reverse 1:4).
    quantity: Mapped[float] = mapped_column(Float)
    price: Mapped[float] = mapped_column(Float)

    # Negative fee reduces the cost basis — that is how an assigned short put is
    # recorded, where the real cost is the strike less the premium collected.
    # For DIV, fee carries the tax withheld.
    fee: Mapped[float] = mapped_column(Float, default=0.0)

    # Rate to CZK on the trade date. Once resolved it is never rewritten.
    fx_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    isin: Mapped[str] = mapped_column(String(16), default="")
    name: Mapped[str] = mapped_column(String(200), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)

    portfolio: Mapped[Portfolio] = relationship(back_populates="transactions")

    @property
    def instrument_key(self) -> str:
        return f"{self.ticker}|{self.exchange}|{self.currency}"


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    ticker: Mapped[str] = mapped_column(String(32))
    exchange: Mapped[str] = mapped_column(String(16))
    currency: Mapped[str] = mapped_column(String(8))
    asset_class: Mapped[str] = mapped_column(String(16), default="STOCK")
    name: Mapped[str] = mapped_column(String(200), default="")

    group_name: Mapped[str] = mapped_column(String(64), default="Čekám na vstup")
    # Required. Without a concrete number the list is a wish list, not a plan.
    target_price: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(Text, default="")

    added_at: Mapped[dt.date] = mapped_column(Date, default=lambda: dt.date.today())
    # Captured once when the item is created and never rewritten — this is what
    # makes "how it moved since I noticed it" answerable.
    price_at_add: Mapped[float | None] = mapped_column(Float, nullable=True)

    archived_at: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    moved_to_portfolio_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user: Mapped[User] = relationship(back_populates="watchlist")

    @property
    def instrument_key(self) -> str:
        return f"{self.ticker}|{self.exchange}|{self.currency}"


class PriceCache(Base):
    """Last automatically fetched price per instrument. Shared across users."""

    __tablename__ = "price_cache"

    instrument_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    price: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8))
    source: Mapped[str] = mapped_column(String(32), default="yfinance")
    fetched_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class InstrumentInfo(Base):
    """Sector/industry/country per instrument, cached like PriceCache and
    shared across users — a company's sector isn't something each user has
    their own answer to, and it barely changes, so the cache lifetime is
    long (see classification.py)."""

    __tablename__ = "instrument_info"

    instrument_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    sector: Mapped[str | None] = mapped_column(String(80), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fetched_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class ManualPrice(Base):
    """A price the user typed in. Always wins over the cached one."""

    __tablename__ = "manual_prices"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    instrument_key: Mapped[str] = mapped_column(String(64), index=True)
    price: Mapped[float] = mapped_column(Float)
    set_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)

    __table_args__ = (
        UniqueConstraint("user_id", "instrument_key", name="uq_manual_price_user_instrument"),
    )


class FxRate(Base):
    """Daily CNB rate to CZK. Historical rates are written once and never updated."""

    __tablename__ = "fx_rates"

    currency: Mapped[str] = mapped_column(String(8), primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    rate: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(32), default="cnb")
    fetched_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class Segment(Base):
    """A user-defined slice of the portfolio ("Vlastní rozdělení") — e.g. "Core"
    vs "Speculative" — alongside the built-in class/currency/instrument views."""

    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(16), default="#dcb45c")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_segment_user_name"),)


class SegmentMember(Base):
    """Which segment an instrument belongs to. An instrument sits in at most one
    segment — this is a partition of the portfolio, not free-form tagging — so
    assigning a new segment simply replaces the existing row."""

    __tablename__ = "segment_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    segment_id: Mapped[int] = mapped_column(ForeignKey("segments.id", ondelete="CASCADE"), index=True)
    instrument_key: Mapped[str] = mapped_column(String(64))

    __table_args__ = (
        UniqueConstraint("user_id", "instrument_key", name="uq_segment_member_user_instrument"),
    )


class TickerNote(Base):
    """A free-text note the user jotted about one instrument in the AI analýza
    layer — their own thinking, not part of the analysis itself. Keyed by the
    resolved Yahoo symbol, which already encodes exchange, so "NVDA" and a
    Prague-listed ticker with the same root never collide."""

    __tablename__ = "ticker_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class RebalanceTarget(Base):
    """The user's own target allocation by asset class — e.g. "80% STOCK, 15%
    ETF, 5% CRYPTO" — used to suggest what to buy or sell to get there. Purely
    the user's own numbers; the app never invents a target."""

    __tablename__ = "rebalance_targets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    asset_class: Mapped[str] = mapped_column(String(16))
    target_pct: Mapped[float] = mapped_column(Float)

    __table_args__ = (
        UniqueConstraint("user_id", "asset_class", name="uq_rebalance_target_user_class"),
    )


class ManualAsset(Base):
    """A hand-valued thing outside the securities engine — cash, real estate,
    a car, anything else — that still counts toward net worth. No FIFO, no
    tax test, no live price: the user types a value and updates it whenever
    they want, the same way Kubera-style net-worth trackers treat these."""

    __tablename__ = "manual_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(16), default="OTHER")  # CASH | REAL_ESTATE | OTHER
    value_czk: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class FinancialGoal(Base):
    """A named target — "Důchod", "Záloha na byt" — measured against net
    worth (securities plus manual assets). The required-return math is
    computed on read, not stored, so it always reflects today's value."""

    __tablename__ = "financial_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    target_value_czk: Mapped[float] = mapped_column(Float)
    target_date: Mapped[dt.date] = mapped_column(Date)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class Snapshot(Base):
    """Monthly point for the value chart. The chart is never reconstructed
    backwards — that would need historical prices and FX for every day."""

    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(
        ForeignKey("portfolios.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[dt.date] = mapped_column(Date)
    value_czk: Mapped[float] = mapped_column(Float)
    invested_czk: Mapped[float] = mapped_column(Float)
    benchmark_value_czk: Mapped[float | None] = mapped_column(Float, nullable=True)

    portfolio: Mapped[Portfolio] = relationship(back_populates="snapshots")

    __table_args__ = (UniqueConstraint("portfolio_id", "date", name="uq_snapshot_portfolio_date"),)
