"""Portfolios and the transactions inside them."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, owned_portfolio
from app.models import Portfolio, Transaction, User
from app.schemas import (
    PortfolioCreate,
    PortfolioResponse,
    PortfolioUpdate,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from app.services import fx as fx_service

router = APIRouter(prefix="/api/portfolios", tags=["portfolios"])


def _as_response(portfolio: Portfolio, db: Session) -> PortfolioResponse:
    count = db.query(Transaction).filter(Transaction.portfolio_id == portfolio.id).count()
    return PortfolioResponse(
        id=portfolio.id,
        name=portfolio.name,
        note=portfolio.note or "",
        created_at=portfolio.created_at,
        transaction_count=count,
    )


@router.get("", response_model=list[PortfolioResponse])
def list_portfolios(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list[PortfolioResponse]:
    rows = (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user.id)
        .order_by(Portfolio.created_at)
        .all()
    )
    return [_as_response(row, db) for row in rows]


@router.post("", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
def create_portfolio(
    payload: PortfolioCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PortfolioResponse:
    exists = (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user.id, Portfolio.name == payload.name.strip())
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Portfolio s tímto názvem už existuje.")

    portfolio = Portfolio(user_id=user.id, name=payload.name.strip(), note=payload.note)
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return _as_response(portfolio, db)


@router.patch("/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: int,
    payload: PortfolioUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PortfolioResponse:
    portfolio = owned_portfolio(portfolio_id, user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(portfolio, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(portfolio)
    return _as_response(portfolio, db)


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio(
    portfolio_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    portfolio = owned_portfolio(portfolio_id, user, db)
    remaining = db.query(Portfolio).filter(Portfolio.user_id == user.id).count()
    if remaining <= 1:
        raise HTTPException(
            status_code=400,
            detail="Poslední portfolio nejde smazat. Přejmenuj ho, nebo si nejdřív založ další.",
        )
    db.delete(portfolio)
    db.commit()


# --------------------------------------------------------------------------
# Transactions
# --------------------------------------------------------------------------


def _tx_response(tx: Transaction, portfolio_name: str = "") -> TransactionResponse:
    return TransactionResponse(
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


@router.get("/{portfolio_id}/transactions", response_model=list[TransactionResponse])
def list_transactions(
    portfolio_id: int,
    ticker: str | None = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[TransactionResponse]:
    portfolio = owned_portfolio(portfolio_id, user, db)
    query = db.query(Transaction).filter(Transaction.portfolio_id == portfolio.id)
    if ticker:
        query = query.filter(Transaction.ticker == ticker.upper())
    rows = query.order_by(Transaction.date.desc(), Transaction.id.desc()).all()
    return [_tx_response(row, portfolio.name) for row in rows]


def _resolve_missing_rate(db: Session, tx: Transaction) -> None:
    """Fills in the rate for the trade date when the user left it blank."""
    if tx.fx_rate is not None or tx.currency == "CZK":
        return
    tx.fx_rate = fx_service.rate_to_czk(db, tx.currency, tx.date)


@router.post(
    "/{portfolio_id}/transactions",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    portfolio_id: int,
    payload: TransactionCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TransactionResponse:
    portfolio = owned_portfolio(portfolio_id, user, db)
    tx = Transaction(portfolio_id=portfolio.id, **payload.model_dump())
    _resolve_missing_rate(db, tx)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return _tx_response(tx, portfolio.name)


@router.patch("/{portfolio_id}/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    portfolio_id: int,
    transaction_id: int,
    payload: TransactionUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TransactionResponse:
    portfolio = owned_portfolio(portfolio_id, user, db)
    tx = db.get(Transaction, transaction_id)
    if tx is None or tx.portfolio_id != portfolio.id:
        raise HTTPException(status_code=404, detail="Transakce nenalezena.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            if field in ("ticker", "exchange", "type", "asset_class"):
                value = str(value).strip().upper()
            setattr(tx, field, value)
    _resolve_missing_rate(db, tx)
    db.commit()
    db.refresh(tx)
    return _tx_response(tx, portfolio.name)


@router.delete(
    "/{portfolio_id}/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_transaction(
    portfolio_id: int,
    transaction_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    portfolio = owned_portfolio(portfolio_id, user, db)
    tx = db.get(Transaction, transaction_id)
    if tx is None or tx.portfolio_id != portfolio.id:
        raise HTTPException(status_code=404, detail="Transakce nenalezena.")
    db.delete(tx)
    db.commit()
