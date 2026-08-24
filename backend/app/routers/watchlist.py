"""The watchlist: what I want to own, and on what condition I would buy it.

The decision is made calmly, at the moment of writing it down. The tool then
only watches whether the condition has occurred. That is what separates the
analysis from the impulse, and it is why the target price is mandatory.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, owned_portfolio
from app.models import Transaction, User, WatchlistItem
from app.schemas import (
    WatchlistBuy,
    WatchlistCreate,
    WatchlistResponse,
    WatchlistUpdate,
)
from app.services import fx as fx_service
from app.services import prices as price_service

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

#: Beyond this the list stops being something a person actually reviews.
SUGGESTED_MAX_ITEMS = 50


def _to_response(item: WatchlistItem, quote) -> WatchlistResponse:
    current = quote.price if quote else None

    distance = None
    if current is not None and item.target_price:
        # How far the price still has to fall to reach the entry.
        distance = (current - item.target_price) / item.target_price * 100.0

    change = None
    if current is not None and item.price_at_add:
        change = (current / item.price_at_add - 1.0) * 100.0

    return WatchlistResponse(
        id=item.id,
        ticker=item.ticker,
        exchange=item.exchange,
        currency=item.currency,
        asset_class=item.asset_class,
        name=item.name or "",
        group_name=item.group_name,
        target_price=item.target_price,
        note=item.note or "",
        added_at=item.added_at,
        price_at_add=item.price_at_add,
        current_price=current,
        price_as_of=quote.as_of.isoformat() if quote and quote.as_of else None,
        distance_to_target_pct=distance,
        change_since_added_pct=change,
        target_reached=bool(current is not None and current <= item.target_price),
        archived_at=item.archived_at,
        moved_to_portfolio_id=item.moved_to_portfolio_id,
    )


def _quotes_for(db: Session, user: User, items: list[WatchlistItem], allow_fetch: bool):
    instruments = [(i.ticker, i.exchange, i.currency, i.asset_class) for i in items]
    return price_service.get_prices(db, user.id, instruments, allow_fetch=allow_fetch)


@router.get("", response_model=list[WatchlistResponse])
def list_items(
    include_archived: bool = False,
    refresh: bool = False,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[WatchlistResponse]:
    query = db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id)
    if not include_archived:
        query = query.filter(WatchlistItem.archived_at.is_(None))
    items = query.all()

    quotes = _quotes_for(db, user, items, allow_fetch=refresh)
    responses = [_to_response(item, quotes.get(item.instrument_key)) for item in items]

    # Closest to the entry first, and anything already there jumps to the top.
    responses.sort(
        key=lambda r: (
            not r.target_reached,
            r.distance_to_target_pct if r.distance_to_target_pct is not None else 1e9,
        )
    )
    return responses


@router.post("", response_model=WatchlistResponse, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: WatchlistCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> WatchlistResponse:
    existing = (
        db.query(WatchlistItem)
        .filter(
            WatchlistItem.user_id == user.id,
            WatchlistItem.ticker == payload.ticker,
            WatchlistItem.exchange == payload.exchange,
            WatchlistItem.currency == payload.currency,
            WatchlistItem.archived_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Tento titul už na watchlistu je.")

    item = WatchlistItem(user_id=user.id, added_at=date.today(), **payload.model_dump())

    # The price on the day it was noticed is captured once and never rewritten —
    # it is what makes "how it moved since" answerable later.
    quotes = price_service.get_prices(
        db, user.id, [(item.ticker, item.exchange, item.currency, item.asset_class)],
        allow_fetch=True,
    )
    quote = quotes.get(item.instrument_key)
    item.price_at_add = quote.price if quote else None

    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_response(item, quote)


@router.patch("/{item_id}", response_model=WatchlistResponse)
def update_item(
    item_id: int,
    payload: WatchlistUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> WatchlistResponse:
    item = db.get(WatchlistItem, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, field, value)
    db.commit()
    db.refresh(item)

    quotes = _quotes_for(db, user, [item], allow_fetch=False)
    return _to_response(item, quotes.get(item.instrument_key))


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> None:
    item = db.get(WatchlistItem, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")
    db.delete(item)
    db.commit()


@router.post("/{item_id}/buy", status_code=status.HTTP_201_CREATED)
def buy_item(
    item_id: int,
    payload: WatchlistBuy,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Turns a watchlist entry into a position and archives the entry.

    The note travels with it, so the portfolio keeps a record of why each
    position was bought and where it came from.
    """
    item = db.get(WatchlistItem, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")
    portfolio = owned_portfolio(payload.portfolio_id, user, db)

    fx_rate = payload.fx_rate
    if fx_rate is None and item.currency != "CZK":
        fx_rate = fx_service.rate_to_czk(db, item.currency, payload.date)

    tx = Transaction(
        portfolio_id=portfolio.id,
        type="BUY",
        date=payload.date,
        ticker=item.ticker,
        exchange=item.exchange,
        asset_class=item.asset_class,
        quantity=payload.quantity,
        price=payload.price,
        currency=item.currency,
        fee=payload.fee,
        fx_rate=fx_rate,
        name=item.name or "",
        note=item.note or "",
    )
    db.add(tx)

    item.archived_at = date.today()
    item.moved_to_portfolio_id = portfolio.id
    db.commit()
    db.refresh(tx)

    return {
        "transaction_id": tx.id,
        "portfolio_id": portfolio.id,
        "instrument_key": item.instrument_key,
        "archived": True,
    }


@router.get("/groups", response_model=list[str])
def list_groups(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list[str]:
    defaults = ["Čekám na vstup", "Sleduji", "Zamítnuto"]
    used = {
        row.group_name
        for row in db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id)
    }
    return defaults + sorted(used - set(defaults))
