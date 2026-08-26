"""Financial goal tracking: a named target value and date, measured against
today's net worth. The required annual return is solved for directly —
``target = current * (1 + r) ** years`` — rather than assumed, so it always
reflects today's number and the time actually left, not a canned estimate."""

from datetime import date

from app.models import FinancialGoal
from app.schemas import GoalResponse


def build_response(goal: FinancialGoal, current_value_czk: float, today: date) -> GoalResponse:
    progress_pct = (current_value_czk / goal.target_value_czk * 100.0) if goal.target_value_czk else 0.0
    reached = current_value_czk >= goal.target_value_czk

    required_return: float | None = None
    if not reached:
        years_remaining = (goal.target_date - today).days / 365.25
        if years_remaining > 0 and current_value_czk > 0:
            required_return = ((goal.target_value_czk / current_value_czk) ** (1 / years_remaining) - 1) * 100.0

    return GoalResponse(
        id=goal.id,
        name=goal.name,
        target_value_czk=goal.target_value_czk,
        target_date=goal.target_date,
        current_value_czk=current_value_czk,
        progress_pct=progress_pct,
        required_annual_return_pct=required_return,
        reached=reached,
    )
