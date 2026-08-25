"""Free-text notes a user keeps about one instrument, next to the AI analýza
for that ticker. The user's own thinking, not part of the analysis itself."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import TickerNote, User
from app.schemas import NoteCreate, NoteResponse

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("", response_model=list[NoteResponse])
def list_notes(
    symbol: str = Query(..., min_length=1, max_length=32),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[TickerNote]:
    return (
        db.query(TickerNote)
        .filter(TickerNote.user_id == user.id, TickerNote.symbol == symbol.upper())
        .order_by(TickerNote.created_at.desc())
        .all()
    )


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(
    payload: NoteCreate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> TickerNote:
    note = TickerNote(user_id=user.id, symbol=payload.symbol.upper(), text=payload.text.strip())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> None:
    note = db.get(TickerNote, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="Poznámka nenalezena.")
    db.delete(note)
    db.commit()
