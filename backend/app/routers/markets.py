"""A small "Trhy" overview: a handful of major index/commodity/crypto/FX
quotes, independent of anything the user holds. Best-effort — see
app.services.markets for why a quote can come back with a null price."""

from dataclasses import asdict

from fastapi import APIRouter, Depends

from app.deps import current_user
from app.models import User
from app.services import markets as markets_service

router = APIRouter(prefix="/api/markets", tags=["markets"])


@router.get("/overview")
def markets_overview(user: User = Depends(current_user)) -> list[dict]:
    return [asdict(quote) for quote in markets_service.fetch_overview()]
