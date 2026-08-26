"""Target-allocation rebalancing: the user sets what share of the portfolio
each asset class should be, and this turns the gap between that and today's
actual split into a buy/sell amount per class. The targets are entirely the
user's own numbers — nothing here suggests what the target should be."""

from sqlalchemy.orm import Session

from app.models import RebalanceTarget, User
from app.services import portfolio_view


def get_targets(db: Session, user: User) -> dict[str, float]:
    rows = db.query(RebalanceTarget).filter(RebalanceTarget.user_id == user.id).all()
    return {row.asset_class: row.target_pct for row in rows}


def set_targets(db: Session, user: User, targets: dict[str, float]) -> None:
    db.query(RebalanceTarget).filter(RebalanceTarget.user_id == user.id).delete()
    for asset_class, pct in targets.items():
        db.add(RebalanceTarget(user_id=user.id, asset_class=asset_class, target_pct=pct))
    db.commit()


def build_suggestions(
    db: Session, user: User, portfolio_ids: list[int] | None = None
) -> tuple[float, list[dict]]:
    """Returns (sum of target percentages, one suggestion per targeted class).

    The sum is returned alongside the suggestions rather than validated away —
    a user mid-edit of their targets may have them not add to 100 yet, and the
    frontend decides how loudly to say so.
    """
    targets = get_targets(db, user)
    if not targets:
        return 0.0, []

    view = portfolio_view.build_view(db, user, portfolio_ids=portfolio_ids, allow_fetch=False)
    total = view.value_czk or 0.0
    current_by_class = {slice_.label: slice_.value_czk for slice_ in view.allocation_by_class}

    suggestions = []
    for asset_class, target_pct in sorted(targets.items()):
        current_value = current_by_class.get(asset_class, 0.0)
        current_pct = (current_value / total * 100.0) if total else 0.0
        target_value = total * target_pct / 100.0
        suggestions.append(
            {
                "asset_class": asset_class,
                "target_pct": target_pct,
                "current_pct": current_pct,
                "current_value_czk": current_value,
                "target_value_czk": target_value,
                "delta_czk": target_value - current_value,
            }
        )
    return sum(targets.values()), suggestions
