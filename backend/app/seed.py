"""Seeds one demo account so a fresh deployment has something to look at
immediately, without anyone having to import a CSV or type in prices first.

Idempotent: skipped entirely once a user with DEMO_EMAIL already exists, so
this only ever runs once per database, and existing edits to the demo
account (or a same-named account created by someone else) are never touched.

Every number here is invented for demonstration, but it is inserted through
the exact same tables and manual-price mechanism a real user's own data would
use — nothing here is a special case the rest of the app treats differently.
"""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.engine.currency import major_currency, quoted_rate_from_major
from app.models import (
    Portfolio,
    Segment,
    SegmentMember,
    Snapshot,
    TickerNote,
    Transaction,
    User,
    WatchlistItem,
)
from app.security import hash_password
from app.services.prices import set_manual_price

DEMO_EMAIL = "demo@bfxportfolio.cz"
DEMO_PASSWORD = "Ukazka2026"
DEMO_DISPLAY_NAME = "Demo účet"

# CZK per one unit of the *major* currency — a fixed illustrative rate is fine
# here since these are historical trade-date rates for invented transactions,
# not something the app is meant to look up. quoted_rate_from_major() converts
# this to CZK-per-quoted-unit for minor-unit currencies like GBX.
_FX_MAJOR_RATE = {"USD": 22.5, "EUR": 25.0, "GBP": 29.0}


def _ago(days: int) -> date:
    return date.today() - timedelta(days=days)


def _fx_rate(currency: str) -> float | None:
    if currency == "CZK":
        return 1.0
    major = major_currency(currency)
    if major not in _FX_MAJOR_RATE:
        return None
    return quoted_rate_from_major(_FX_MAJOR_RATE[major], currency)


def seed_demo_account(db: Session) -> None:
    if db.query(User).filter(User.email == DEMO_EMAIL).first() is not None:
        return

    user = User(
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD),
        display_name=DEMO_DISPLAY_NAME,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    main = Portfolio(user_id=user.id, name="Hlavní", note="Jádro portfolia — dlouhodobé pozice.")
    spec = Portfolio(user_id=user.id, name="Spekulace", note="Menší, rizikovější sázky.")
    db.add_all([main, spec])
    db.commit()
    db.refresh(main)
    db.refresh(spec)

    # tax_test_years defaults to 3 (see User.tax_test_years); these offsets are
    # picked to land in each of the four holding-period states.
    passed_old = _ago(365 * 4)  # matured over a year ago
    passed_split = _ago(365 * 3 + 30)
    soon = _ago(365 * 3 - 60)  # matures within 90 days
    approaching = _ago(365 * 3 - 200)  # matures within 365 days
    far_recent = _ago(60)

    def buy(portfolio_id, ticker, exchange, asset_class, currency, qty, price, fee, dt, note=""):
        db.add(
            Transaction(
                portfolio_id=portfolio_id, type="BUY", date=dt, ticker=ticker, exchange=exchange,
                asset_class=asset_class, currency=currency, quantity=qty, price=price, fee=fee,
                fx_rate=_fx_rate(currency), note=note,
            )
        )

    def sell(portfolio_id, ticker, exchange, asset_class, currency, qty, price, fee, dt):
        db.add(
            Transaction(
                portfolio_id=portfolio_id, type="SELL", date=dt, ticker=ticker, exchange=exchange,
                asset_class=asset_class, currency=currency, quantity=qty, price=price, fee=fee,
                fx_rate=_fx_rate(currency),
            )
        )

    def div(portfolio_id, ticker, exchange, asset_class, currency, gross, tax, dt):
        db.add(
            Transaction(
                portfolio_id=portfolio_id, type="DIV", date=dt, ticker=ticker, exchange=exchange,
                asset_class=asset_class, currency=currency, quantity=1, price=gross, fee=tax,
                fx_rate=_fx_rate(currency),
            )
        )

    def adjust(portfolio_id, ticker, exchange, asset_class, currency, ratio, dt):
        db.add(
            Transaction(
                portfolio_id=portfolio_id, type="ADJUST", date=dt, ticker=ticker, exchange=exchange,
                asset_class=asset_class, currency=currency, quantity=ratio, price=0.0, fee=0.0,
                fx_rate=_fx_rate(currency),
            )
        )

    # --- Hlavní: a diversified core ----------------------------------------

    buy(main.id, "AAPL", "NASDAQ", "STOCK", "USD", 25, 120.50, 8.5, passed_old)
    buy(main.id, "AAPL", "NASDAQ", "STOCK", "USD", 15, 165.00, 6.0, far_recent)
    sell(main.id, "AAPL", "NASDAQ", "STOCK", "USD", 10, 195.00, 5.0, _ago(20))
    div(main.id, "AAPL", "NASDAQ", "STOCK", "USD", 45.00, 6.75, _ago(180))
    div(main.id, "AAPL", "NASDAQ", "STOCK", "USD", 48.00, 7.20, _ago(89))

    buy(main.id, "VWCE", "XETRA", "ETF", "EUR", 20, 95.00, 3.0, approaching)
    buy(main.id, "VWCE", "XETRA", "ETF", "EUR", 15, 110.00, 3.0, far_recent)

    buy(main.id, "WIZZ", "LSE", "STOCK", "GBX", 200, 1500.00, 4.0, soon)

    buy(main.id, "CEZ", "PSE", "STOCK", "CZK", 30, 1700.00, 0.0, passed_old)
    adjust(main.id, "CEZ", "PSE", "STOCK", "CZK", 2.0, passed_split)
    sell(main.id, "CEZ", "PSE", "STOCK", "CZK", 20, 1050.00, 0.0, _ago(40))
    div(main.id, "CEZ", "PSE", "STOCK", "CZK", 600.00, 90.00, _ago(89))

    # --- Spekulace: a smaller, riskier sleeve -------------------------------

    buy(spec.id, "NVDA", "NASDAQ", "STOCK", "USD", 8, 95.00, 4.0, _ago(45))
    buy(spec.id, "BTC", "CRYPTO", "CRYPTO", "USD", 0.05, 42000.00, 15.0, _ago(200))
    buy(spec.id, "BTC", "CRYPTO", "CRYPTO", "USD", 0.02, 61000.00, 8.0, _ago(30))

    db.commit()

    # --- Manual prices — the demo reads the same whether or not this
    # deployment happens to have working internet access to Yahoo Finance. ---
    for key, price in [
        ("AAPL|NASDAQ|USD", 195.00),
        ("VWCE|XETRA|EUR", 118.00),
        ("WIZZ|LSE|GBX", 1450.00),
        ("CEZ|PSE|CZK", 1010.00),
        ("NVDA|NASDAQ|USD", 208.46),
        ("BTC|CRYPTO|USD", 64000.00),
    ]:
        set_manual_price(db, user.id, key, price)

    # --- Watchlist: one already at target, two still waiting ---------------

    db.add_all(
        [
            WatchlistItem(
                user_id=user.id, ticker="MSFT", exchange="NASDAQ", currency="USD",
                asset_class="STOCK", name="Microsoft", group_name="Čekám na vstup",
                target_price=350.0, price_at_add=380.0, added_at=_ago(40),
                note="Chci přikoupit, až spadne blíž k 350.",
            ),
            WatchlistItem(
                user_id=user.id, ticker="GOOGL", exchange="NASDAQ", currency="USD",
                asset_class="STOCK", name="Alphabet", group_name="Sleduji",
                target_price=150.0, price_at_add=140.0, added_at=_ago(15),
            ),
            WatchlistItem(
                user_id=user.id, ticker="TSLA", exchange="NASDAQ", currency="USD",
                asset_class="STOCK", name="Tesla", group_name="Čekám na vstup",
                target_price=250.0, price_at_add=300.0, added_at=_ago(70),
                note="Cíl splněn — rozhodnout, jestli ještě platí.",
            ),
        ]
    )
    for key, price in [("MSFT|NASDAQ|USD", 415.00), ("GOOGL|NASDAQ|USD", 348.06), ("TSLA|NASDAQ|USD", 210.00)]:
        set_manual_price(db, user.id, key, price)

    # --- Segments: "Vlastní rozdělení" — WIZZ stays unassigned on purpose --

    core = Segment(user_id=user.id, name="Jádro", color="#dcb45c", sort_order=0)
    spekulace = Segment(user_id=user.id, name="Spekulace", color="#e3897f", sort_order=1)
    db.add_all([core, spekulace])
    db.commit()
    db.refresh(core)
    db.refresh(spekulace)

    db.add_all(
        [
            SegmentMember(user_id=user.id, segment_id=core.id, instrument_key="AAPL|NASDAQ|USD"),
            SegmentMember(user_id=user.id, segment_id=core.id, instrument_key="VWCE|XETRA|EUR"),
            SegmentMember(user_id=user.id, segment_id=core.id, instrument_key="CEZ|PSE|CZK"),
            SegmentMember(user_id=user.id, segment_id=spekulace.id, instrument_key="NVDA|NASDAQ|USD"),
            SegmentMember(user_id=user.id, segment_id=spekulace.id, instrument_key="BTC|CRYPTO|USD"),
        ]
    )

    # --- Snapshots: an earlier point this year, so YTD and the value chart
    # have something to show without the demo user clicking anything first. -

    db.add_all(
        [
            Snapshot(portfolio_id=main.id, date=_ago(200), value_czk=300_000.0, invested_czk=250_000.0),
            Snapshot(portfolio_id=main.id, date=_ago(60), value_czk=330_000.0, invested_czk=260_000.0),
            Snapshot(portfolio_id=spec.id, date=_ago(200), value_czk=20_000.0, invested_czk=18_000.0),
            Snapshot(portfolio_id=spec.id, date=_ago(60), value_czk=32_000.0, invested_czk=20_000.0),
        ]
    )

    db.add(
        TickerNote(
            user_id=user.id,
            symbol="NVDA",
            text="Sledovat po čtvrtletních výsledcích — valuace je vysoká, ale růst to zatím nese.",
        )
    )

    db.commit()
