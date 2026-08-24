"""Quantitative portfolio analysis: performance, benchmark, Monte Carlo, optimisation.

These run on a set of tickers and weights. The weights can be typed in by hand,
or derived from what the user actually holds — see `/api/quant/from-portfolio`,
which turns the tracked positions into an input for this layer so the analysis
describes the real portfolio rather than a hypothetical one.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas import (
    AnalyzeResponse,
    MonteCarloRequest,
    MonteCarloResponse,
    OptimizeRequest,
    OptimizeResponse,
    PortfolioRequest,
    QuantBenchmarkRequest,
    QuantBenchmarkResponse,
)
from app.services import portfolio_view
from app.services.quant import (
    AnalysisError,
    analyze_portfolio,
    compare_benchmark,
    optimize_portfolio,
    run_monte_carlo,
)

router = APIRouter(prefix="/api/portfolio", tags=["quant"])


def _guard(call, payload):
    try:
        return call(payload)
    except AnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: PortfolioRequest) -> AnalyzeResponse:
    return _guard(analyze_portfolio, req)


@router.post("/benchmark", response_model=QuantBenchmarkResponse)
def benchmark(req: QuantBenchmarkRequest) -> QuantBenchmarkResponse:
    return _guard(compare_benchmark, req)


@router.post("/monte-carlo", response_model=MonteCarloResponse)
def monte_carlo(req: MonteCarloRequest) -> MonteCarloResponse:
    return _guard(run_monte_carlo, req)


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest) -> OptimizeResponse:
    return _guard(optimize_portfolio, req)


@router.get("/from-holdings")
def from_holdings(
    portfolio_ids: list[int] | None = Query(None),
    years: int = Query(5, ge=1, le=30),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Turns the tracked positions into tickers and weights for this layer.

    Only open positions with a known value can carry a weight, so anything
    missing a price is reported separately rather than silently dropped.
    """
    view = portfolio_view.build_view(db, user, portfolio_ids=portfolio_ids or None, allow_fetch=False)

    priced = [p for p in view.positions if p.value_czk and p.quantity > 0]
    excluded = [
        {"ticker": p.ticker, "reason": "chybí aktuální cena"}
        for p in view.positions
        if p.quantity > 0 and not p.value_czk
    ]

    total = sum(p.value_czk for p in priced)
    if not priced or total <= 0:
        return {
            "tickers": [],
            "weights": [],
            "excluded": excluded,
            "note": "Zatím není z čeho složit analýzu. Přidej pozice a dohledej ceny.",
        }

    today = date.today()
    return {
        "tickers": [p.ticker for p in priced],
        "weights": [round(p.value_czk / total, 6) for p in priced],
        "excluded": excluded,
        "start_date": (today - timedelta(days=365 * years)).isoformat(),
        "end_date": today.isoformat(),
        "risk_free_rate": 0.04,
        "note": None,
    }
