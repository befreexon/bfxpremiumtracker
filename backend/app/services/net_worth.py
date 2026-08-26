"""Net worth as a single number — securities across every portfolio plus
manual assets — shared between the net-worth view and financial goals."""

from sqlalchemy.orm import Session

from app.models import ManualAsset, User
from app.services import portfolio_view


def current_net_worth(db: Session, user: User) -> float:
    view = portfolio_view.build_view(db, user, portfolio_ids=None, allow_fetch=False)
    assets_total = sum(
        asset.value_czk for asset in db.query(ManualAsset).filter(ManualAsset.user_id == user.id)
    )
    return view.value_czk + assets_total
