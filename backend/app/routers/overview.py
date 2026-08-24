"""The portfolio picture: header numbers, positions, allocation, warnings."""

from dataclasses import asdict, is_dataclass
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.services import portfolio_view

router = APIRouter(prefix="/api", tags=["overview"])


def serialize(value):
    """dataclasses -> plain JSON, with dates as ISO strings."""
    if is_dataclass(value) and not isinstance(value, type):
        return {key: serialize(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialize(item) for item in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


@router.get("/overview")
def overview(
    portfolio_ids: list[int] | None = Query(None, description="Prázdné = vše dohromady"),
    refresh: bool = Query(False, description="Vynutí nové dohledání cen"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    view = portfolio_view.build_view(
        db,
        user,
        portfolio_ids=portfolio_ids or None,
        allow_fetch=refresh,
        force_refresh=refresh,
    )
    return serialize(view)


@router.get("/positions/{instrument_key:path}")
def position_detail(
    instrument_key: str,
    portfolio_ids: list[int] | None = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """One position with its lots, sales, dividends and splits."""
    view = portfolio_view.build_view(
        db, user, portfolio_ids=portfolio_ids or None, allow_fetch=False
    )
    for position in view.positions:
        if position.instrument_key == instrument_key:
            return serialize(position)
    return {"detail": "Pozice nenalezena."}
