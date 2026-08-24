"""The AI analysis layer: one instrument put under a lens.

Everything here is an assessment, never an instruction to trade. The score is
broken down into the factors that produced it so the user can disagree with any
one of them, and the projection is a distribution implied by past volatility
rather than a forecast.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas import AiAnalysisRequest
from app.services.ai_analysis import AnalysisUnavailable, analyze_ticker, to_dict

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/analyze")
def analyze(
    payload: AiAnalysisRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        analysis = analyze_ticker(
            payload.ticker,
            exchange=payload.exchange,
            lookback_days=payload.lookback_days,
            horizon_days=payload.horizon_days,
        )
    except AnalysisUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    result = to_dict(analysis)
    if not payload.include_narrative:
        result["narrative"] = None
    return result
