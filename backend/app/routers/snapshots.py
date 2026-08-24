"""Monthly snapshots and the benchmark comparison."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, owned_portfolio
from app.models import Portfolio, User
from app.schemas import BenchmarkResponse, ManualBenchmarkRequest, SnapshotResponse
from app.services import portfolio_view, snapshots

router = APIRouter(prefix="/api", tags=["snapshots"])


def _selected_portfolios(
    db: Session, user: User, portfolio_ids: list[int] | None
) -> list[Portfolio]:
    query = db.query(Portfolio).filter(Portfolio.user_id == user.id)
    if portfolio_ids:
        query = query.filter(Portfolio.id.in_(portfolio_ids))
    return query.all()


@router.get("/snapshots", response_model=list[SnapshotResponse])
def list_snapshots(
    portfolio_ids: list[int] | None = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[SnapshotResponse]:
    selected = _selected_portfolios(db, user, portfolio_ids)
    rows = snapshots.history(db, [p.id for p in selected])
    return [SnapshotResponse(**row) for row in rows]


@router.post("/snapshots", response_model=list[SnapshotResponse])
def take_snapshot(
    portfolio_ids: list[int] | None = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[SnapshotResponse]:
    """Records where each selected portfolio stands, one point per month."""
    for portfolio in _selected_portfolios(db, user, portfolio_ids):
        view = portfolio_view.build_view(
            db, user, portfolio_ids=[portfolio.id], allow_fetch=False
        )
        snapshots.record_snapshot(
            db,
            portfolio,
            value_czk=view.value_czk,
            invested_czk=view.invested_czk,
        )

    selected = _selected_portfolios(db, user, portfolio_ids)
    return [SnapshotResponse(**row) for row in snapshots.history(db, [p.id for p in selected])]


@router.get("/benchmark", response_model=BenchmarkResponse)
def benchmark(
    portfolio_ids: list[int] | None = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> BenchmarkResponse:
    view = portfolio_view.build_view(
        db, user, portfolio_ids=portfolio_ids or None, allow_fetch=False
    )
    transactions = portfolio_view.load_transactions(db, user, portfolio_ids)
    result = snapshots.compute_benchmark(db, user, transactions, view.value_czk)
    return BenchmarkResponse(**result.__dict__)


@router.put("/benchmark/manual", response_model=BenchmarkResponse)
def set_manual_benchmark(
    payload: ManualBenchmarkRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> BenchmarkResponse:
    """Lets the user correct the benchmark by hand when the lookup is off."""
    portfolio = owned_portfolio(payload.portfolio_id, user, db)
    view = portfolio_view.build_view(
        db, user, portfolio_ids=[portfolio.id], allow_fetch=False
    )
    row = snapshots.record_snapshot(
        db,
        portfolio,
        value_czk=view.value_czk,
        invested_czk=view.invested_czk,
        benchmark_value_czk=payload.value_czk,
    )
    return BenchmarkResponse(
        ticker=user.benchmark_ticker,
        benchmark_value_czk=payload.value_czk,
        portfolio_value_czk=view.value_czk,
        difference_czk=view.value_czk - payload.value_czk,
        computed_at=row.date.isoformat(),
        is_manual=True,
    )
