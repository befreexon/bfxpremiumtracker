"""Tax-loss harvesting candidates — see app.services.tax_loss."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas import TaxLossResponse
from app.services.tax_loss import build_harvest_view

router = APIRouter(prefix="/api/tax-loss", tags=["tax-loss"])


@router.get("", response_model=TaxLossResponse)
def get_harvest_view(
    portfolio_ids: list[int] | None = Query(None, description="Prázdné = vše dohromady"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaxLossResponse:
    return TaxLossResponse(**build_harvest_view(db, user, portfolio_ids or None))
