"""Target-allocation rebalancing by asset class — see app.services.rebalance."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas import RebalanceResponse, RebalanceTargetsSet
from app.services import rebalance as rebalance_service

router = APIRouter(prefix="/api/rebalance", tags=["rebalance"])


@router.get("/targets", response_model=dict[str, float])
def get_targets(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, float]:
    return rebalance_service.get_targets(db, user)


@router.put("/targets", response_model=dict[str, float])
def set_targets(
    payload: RebalanceTargetsSet, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, float]:
    rebalance_service.set_targets(db, user, payload.targets)
    return rebalance_service.get_targets(db, user)


@router.get("", response_model=RebalanceResponse)
def get_suggestions(
    portfolio_ids: list[int] | None = Query(None, description="Prázdné = vše dohromady"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> RebalanceResponse:
    targets_sum, suggestions = rebalance_service.build_suggestions(db, user, portfolio_ids or None)
    return RebalanceResponse(targets_sum_pct=targets_sum, suggestions=suggestions)
