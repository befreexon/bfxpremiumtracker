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
