"""Financial goals — see app.services.goals for the required-return math."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import FinancialGoal, User
from app.schemas import GoalCreate, GoalResponse, GoalUpdate
from app.services.goals import build_response
from app.services.net_worth import current_net_worth

router = APIRouter(prefix="/api/goals", tags=["goals"])


def _owned_goal(goal_id: int, user: User, db: Session) -> FinancialGoal:
    goal = db.get(FinancialGoal, goal_id)
    if goal is None or goal.user_id != user.id:
        raise HTTPException(status_code=404, detail="Cíl nenalezen.")
    return goal


@router.get("", response_model=list[GoalResponse])
def list_goals(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[GoalResponse]:
    goals = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.user_id == user.id)
        .order_by(FinancialGoal.target_date)
        .all()
    )
    current_value = current_net_worth(db, user)
    today = date.today()
    return [build_response(goal, current_value, today) for goal in goals]


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> GoalResponse:
    goal = FinancialGoal(user_id=user.id, **payload.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return build_response(goal, current_net_worth(db, user), date.today())


@router.patch("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: int, payload: GoalUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> GoalResponse:
    goal = _owned_goal(goal_id, user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return build_response(goal, current_net_worth(db, user), date.today())


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> None:
    goal = _owned_goal(goal_id, user, db)
    db.delete(goal)
    db.commit()
