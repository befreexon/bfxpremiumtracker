"""CSV import and export.

Import is two steps. The preview parses and validates without writing anything;
the commit writes the rows the preview accepted. Between the two the file lives
in a short-lived in-process cache keyed by a token, so the user does not have to
upload it twice.
"""

import secrets
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import Portfolio, User
from app.schemas import ImportCommitRequest, ImportCommitResponse, ImportPreviewResponse
from app.services import csvio

router = APIRouter(prefix="/api", tags=["import"])

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
PENDING_TTL_SECONDS = 30 * 60
MAX_PENDING = 32
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

#: token -> (user id, file text, stored at)
_pending: dict[str, tuple[int, str, float]] = {}


def _sweep() -> None:
    cutoff = time.time() - PENDING_TTL_SECONDS
    for token in [t for t, (_, _, at) in _pending.items() if at < cutoff]:
        _pending.pop(token, None)
    while len(_pending) > MAX_PENDING:
        _pending.pop(min(_pending, key=lambda t: _pending[t][2]), None)


def _default_portfolio(db: Session, user: User, portfolio_id: int | None = None) -> Portfolio:
    if portfolio_id is not None:
        portfolio = db.get(Portfolio, portfolio_id)
        if portfolio and portfolio.user_id == user.id:
            return portfolio
    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user.id)
        .order_by(Portfolio.created_at)
        .first()
    )
    if portfolio is None:
        portfolio = Portfolio(user_id=user.id, name="Hlavní")
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)
    return portfolio


def _decode(payload: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1250", "iso-8859-2"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=400,
        detail="Soubor se nepodařilo přečíst. Ulož ho v kódování UTF-8.",
    )


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview(
    file: UploadFile = File(...),
    portfolio_id: int | None = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ImportPreviewResponse:
    payload = await file.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Soubor je příliš velký (limit 5 MB).")

    text = _decode(payload)
    portfolio = _default_portfolio(db, user, portfolio_id)
    result = csvio.preview_import(db, user, text, default_portfolio=portfolio)

    _sweep()
    token = secrets.token_urlsafe(24)
    _pending[token] = (user.id, text, time.time())

    return ImportPreviewResponse(
        delimiter=result.delimiter,
        fatal_error=result.fatal_error,
        new_portfolios=result.new_portfolios,
        counts=result.counts,
        rows=[
            {
                "line_number": row.line_number,
                "status": row.status,
                "messages": row.messages,
                "data": _serialise_row(row.data),
                "raw": row.raw,
            }
            for row in result.rows
        ],
        token=token,
    )


def _serialise_row(data: dict | None) -> dict | None:
    if data is None:
        return None
    out = dict(data)
    if out.get("date") is not None:
        out["date"] = out["date"].isoformat()
    return out


@router.post("/import/commit", response_model=ImportCommitResponse)
def commit(
    payload: ImportCommitRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ImportCommitResponse:
    entry = _pending.get(payload.token)
    if entry is None or entry[0] != user.id:
        raise HTTPException(
            status_code=410,
            detail="Náhled importu už není platný. Nahraj soubor znovu.",
        )

    _, text, _ = entry
    portfolio = _default_portfolio(db, user, payload.portfolio_id)
    # Re-validated rather than trusted: the database may have changed since the
    # preview, and a duplicate check that ran a minute ago is not a guarantee.
    result = csvio.preview_import(db, user, text, default_portfolio=portfolio)
    outcome = csvio.commit_import(db, user, result, portfolio)
    _pending.pop(payload.token, None)

    return ImportCommitResponse(**outcome)


@router.get("/export.csv", response_class=PlainTextResponse)
def export(
    portfolio_ids: list[int] | None = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    body = csvio.export_csv(db, user, portfolio_ids or None)
    return PlainTextResponse(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="bfx-portfolio-zaloha.csv"'},
    )


@router.get("/import/template.csv", response_class=PlainTextResponse)
def template(sample: bool = Query(False, description="Vzor se všemi ošklivými případy")) -> PlainTextResponse:
    name = "import-vzor.csv" if sample else "import-sablona.csv"
    body = (STATIC_DIR / name).read_text(encoding="utf-8")
    return PlainTextResponse(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
