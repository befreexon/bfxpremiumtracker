"""Refreshing prices, and correcting them by hand when the lookup is wrong."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas import ManualFxRequest, ManualPriceRequest, RefreshRequest
from app.services import fx as fx_service
from app.services import portfolio_view
from app.services import prices as price_service

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.post("/refresh")
def refresh(
    payload: RefreshRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Re-fetches every price in the selected portfolios, cache bypassed."""
    rows = portfolio_view.load_transactions(db, user, payload.portfolio_ids)
    instruments = list({(r.ticker, r.exchange, r.currency, r.asset_class) for r in rows})
    quotes = price_service.get_prices(
        db, user.id, instruments, force_refresh=True, allow_fetch=True
    )

    found = [q for q in quotes.values() if q.price is not None]
    missing = [q.instrument_key for q in quotes.values() if q.price is None]
    return {
        "refreshed": len(found),
        "missing": missing,
        "quotes": [
            {
                "instrument_key": q.instrument_key,
                "price": q.price,
                "currency": q.currency,
                "is_manual": q.is_manual,
                "as_of": q.as_of.isoformat() if q.as_of else None,
                "error": q.error,
            }
            for q in quotes.values()
        ],
    }


@router.put("/manual")
def set_manual_price(
    payload: ManualPriceRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    row = price_service.set_manual_price(db, user.id, payload.instrument_key, payload.price)
    return {
        "instrument_key": row.instrument_key,
        "price": row.price,
        "set_at": row.set_at.isoformat(),
        "is_manual": True,
    }


@router.delete("/manual/{instrument_key:path}", status_code=status.HTTP_204_NO_CONTENT)
def clear_manual_price(
    instrument_key: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    """Hands the instrument back to automatic pricing."""
    price_service.clear_manual_price(db, user.id, instrument_key)


@router.put("/fx")
def set_manual_fx(
    payload: ManualFxRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    row = fx_service.set_manual_rate(db, payload.currency, payload.date, payload.rate)
    return {"currency": row.currency, "date": row.date.isoformat(), "rate": row.rate}


@router.post("/fx/backfill")
def backfill_rates(
    payload: RefreshRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Fills in rates for trades that were imported without one."""
    rows = portfolio_view.load_transactions(db, user, payload.portfolio_ids)
    filled, still_missing = 0, []

    for tx in rows:
        if tx.fx_rate is not None or tx.currency == "CZK":
            continue
        rate = fx_service.rate_to_czk(db, tx.currency, tx.date)
        if rate is None:
            still_missing.append({"id": tx.id, "ticker": tx.ticker, "date": tx.date.isoformat()})
            continue
        tx.fx_rate = rate
        filled += 1

    db.commit()
    return {"filled": filled, "still_missing": still_missing}
