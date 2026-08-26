"""One consolidated feed of everything across the app that might need the
user's attention — see app.services.alerts for what feeds into it."""

from dataclasses import asdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.services.alerts import build_alerts

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    portfolio_ids: list[int] | None = Query(None, description="Prázdné = vše dohromady"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    return [asdict(alert) for alert in build_alerts(db, user, portfolio_ids or None)]
