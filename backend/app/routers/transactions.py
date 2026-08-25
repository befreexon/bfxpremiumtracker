"""The chronological transaction journal — every BUY/SELL/DIV/ADJUST across a
portfolio scope in one feed, newest first. Distinct from the per-portfolio
listing under /api/portfolios/{id}/transactions used by the edit form: this
one spans portfolios, the way the overview and snapshots endpoints already do."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import Portfolio, Transaction, User
from app.schemas import TransactionResponse

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionResponse])
def list_all_transactions(
    portfolio_ids: list[int] | None = Query(None, description="Prázdné = vše dohromady"),
    limit: int = Query(200, ge=1, le=2000),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[TransactionResponse]:
    query = (
        db.query(Transaction, Portfolio.name)
        .join(Portfolio, Transaction.portfolio_id == Portfolio.id)
        .filter(Portfolio.user_id == user.id)
    )
    if portfolio_ids:
        query = query.filter(Transaction.portfolio_id.in_(portfolio_ids))
    rows = (
        query.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(limit).all()
    )
    return [
        TransactionResponse(
            id=tx.id,
            portfolio_id=tx.portfolio_id,
            portfolio_name=portfolio_name,
            type=tx.type,
            date=tx.date,
            ticker=tx.ticker,
            exchange=tx.exchange,
            asset_class=tx.asset_class,
            quantity=tx.quantity,
            price=tx.price,
            currency=tx.currency,
            fee=tx.fee or 0.0,
            fx_rate=tx.fx_rate,
            isin=tx.isin or "",
            name=tx.name or "",
            note=tx.note or "",
        )
        for tx, portfolio_name in rows
    ]
