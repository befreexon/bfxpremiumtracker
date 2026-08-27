"""Today's biggest movers among current holdings — see app.services.daily_movers.
Always a live fetch (one call per open position), so this is explicitly
triggered by the frontend rather than folded into the main overview load."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas import MoverResponse
from app.services import portfolio_view
from app.services.daily_movers import build_movers

router = APIRouter(prefix="/api/movers", tags=["movers"])


@router.get("", response_model=list[MoverResponse])
def get_movers(
    portfolio_ids: list[int] | None = Query(None, description="Prázdné = vše dohromady"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[MoverResponse]:
    view = portfolio_view.build_view(db, user, portfolio_ids=portfolio_ids or None, allow_fetch=False)
    holdings = [
        {
            "ticker": position.ticker,
            "exchange": position.exchange,
            "currency": position.currency,
            "asset_class": position.asset_class,
            "quantity": position.quantity,
            "fx_rate": position.fx_rate,
        }
        for position in view.positions
        if position.quantity > 0
    ]
    movers = build_movers(holdings)
    return [
        MoverResponse(
            instrument_key=mover.instrument_key,
            ticker=mover.ticker,
            currency=mover.currency,
            price=mover.price,
            move_pct=mover.move_pct,
            move_czk=mover.move_czk,
            error=mover.error,
        )
        for mover in movers
    ]
