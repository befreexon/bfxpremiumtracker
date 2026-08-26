"""Consolidates everything in the app that might need the user's attention
into one list: a watchlist title at its target price, a position that has
grown too concentrated, a lot about to clear its tax-exemption test, or a
price/FX rate the app couldn't find.

Nothing here is computed specially for this feature — every alert restates a
warning or state the Portfolio and Watchlist screens already carry, just
gathered in one place. No network calls are made building this list (prices
are read from whatever is already cached), so it stays cheap to poll.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import User, WatchlistItem
from app.services import portfolio_view
from app.services import prices as price_service


@dataclass
class Alert:
    id: str
    type: str  # watchlist_target | concentration | tax_test_soon | missing_price | missing_fx
    severity: str  # success | warning | info
    message: str
    link: str  # a frontend route


def build_alerts(db: Session, user: User, portfolio_ids: list[int] | None = None) -> list[Alert]:
    alerts: list[Alert] = []
    view = portfolio_view.build_view(db, user, portfolio_ids=portfolio_ids, allow_fetch=False)

    for warning in view.concentration_warnings:
        alerts.append(
            Alert(
                id=f"concentration:{warning['instrument_key']}",
                type="concentration",
                severity="warning",
                message=warning["message"],
                link="/portfolio",
            )
        )

    for position in view.positions:
        if position.quantity <= 0:
            continue
        for lot in position.lots:
            if lot.tax_test_status == "soon" and lot.tax_test_days_remaining is not None:
                alerts.append(
                    Alert(
                        id=f"tax-soon:{position.instrument_key}:{lot.transaction_id}",
                        type="tax_test_soon",
                        severity="info",
                        message=(
                            f"{position.ticker}: tranše z {lot.date} splní časový test "
                            f"za {lot.tax_test_days_remaining} dní."
                        ),
                        link="/portfolio",
                    )
                )

    for key in view.positions_missing_price:
        alerts.append(
            Alert(
                id=f"missing-price:{key}",
                type="missing_price",
                severity="warning",
                message=f"{key.split('|')[0]}: chybí aktuální cena. Zadej ji ručně, nebo obnov ceny.",
                link="/portfolio",
            )
        )

    for key in view.positions_missing_fx:
        alerts.append(
            Alert(
                id=f"missing-fx:{key}",
                type="missing_fx",
                severity="warning",
                message=f"{key.split('|')[0]}: u některé transakce chybí kurz k datu obchodu.",
                link="/portfolio",
            )
        )

    watchlist_items = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user.id, WatchlistItem.archived_at.is_(None))
        .all()
    )
    if watchlist_items:
        instruments = [(i.ticker, i.exchange, i.currency, i.asset_class) for i in watchlist_items]
        quotes = price_service.get_prices(db, user.id, instruments, allow_fetch=False)
        for item in watchlist_items:
            quote = quotes.get(item.instrument_key)
            if quote and quote.price is not None and quote.price <= item.target_price:
                alerts.append(
                    Alert(
                        id=f"watchlist:{item.id}",
                        type="watchlist_target",
                        severity="success",
                        message=f"{item.ticker}: cena dosažena ({quote.price:g} ≤ cíl {item.target_price:g}).",
                        link="/watchlist",
                    )
                )

    order = {"success": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: order.get(a.severity, 3))
    return alerts
