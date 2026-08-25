"""User-defined portfolio segments — a custom breakdown the user names and
colours themselves (e.g. "Core" vs "Speculative"), alongside the built-in
allocation by asset class, currency and instrument."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import Segment, SegmentMember, User
from app.schemas import SegmentAssign, SegmentCreate, SegmentResponse, SegmentUpdate

router = APIRouter(prefix="/api/segments", tags=["segments"])


def _as_response(segment: Segment, db: Session) -> SegmentResponse:
    keys = [
        row.instrument_key
        for row in db.query(SegmentMember).filter(SegmentMember.segment_id == segment.id)
    ]
    return SegmentResponse(id=segment.id, name=segment.name, color=segment.color, member_instrument_keys=keys)


def _owned_segment(segment_id: int, user: User, db: Session) -> Segment:
    segment = db.get(Segment, segment_id)
    if segment is None or segment.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sekce nenalezena.")
    return segment


@router.get("", response_model=list[SegmentResponse])
def list_segments(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list[SegmentResponse]:
    rows = (
        db.query(Segment)
        .filter(Segment.user_id == user.id)
        .order_by(Segment.sort_order, Segment.id)
        .all()
    )
    return [_as_response(row, db) for row in rows]


@router.post("", response_model=SegmentResponse, status_code=status.HTTP_201_CREATED)
def create_segment(
    payload: SegmentCreate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> SegmentResponse:
    name = payload.name.strip()
    exists = db.query(Segment).filter(Segment.user_id == user.id, Segment.name == name).first()
    if exists:
        raise HTTPException(status_code=409, detail="Sekce s tímto názvem už existuje.")

    count = db.query(Segment).filter(Segment.user_id == user.id).count()
    segment = Segment(user_id=user.id, name=name, color=payload.color, sort_order=count)
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return _as_response(segment, db)


@router.patch("/{segment_id}", response_model=SegmentResponse)
def update_segment(
    segment_id: int,
    payload: SegmentUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SegmentResponse:
    segment = _owned_segment(segment_id, user, db)
    if payload.name is not None:
        segment.name = payload.name.strip()
    if payload.color is not None:
        segment.color = payload.color
    db.commit()
    db.refresh(segment)
    return _as_response(segment, db)


@router.delete("/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_segment(
    segment_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> None:
    segment = _owned_segment(segment_id, user, db)
    db.delete(segment)
    db.commit()


@router.put("/assign")
def assign_instrument(
    payload: SegmentAssign, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    existing = (
        db.query(SegmentMember)
        .filter(SegmentMember.user_id == user.id, SegmentMember.instrument_key == payload.instrument_key)
        .first()
    )

    if payload.segment_id is None:
        if existing:
            db.delete(existing)
            db.commit()
        return {"instrument_key": payload.instrument_key, "segment_id": None}

    segment = _owned_segment(payload.segment_id, user, db)
    if existing:
        existing.segment_id = segment.id
    else:
        db.add(SegmentMember(user_id=user.id, segment_id=segment.id, instrument_key=payload.instrument_key))
    db.commit()
    return {"instrument_key": payload.instrument_key, "segment_id": segment.id}
