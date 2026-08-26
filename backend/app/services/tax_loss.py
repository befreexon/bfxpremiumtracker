"""Tax-loss harvesting candidates: open lots sitting at an unrealized loss
where a sale today would still be taxable — the holding-period exemption
hasn't kicked in yet. A lot that has already passed the test is excluded:
an exempt sale's result never enters the taxable base either way, gain or
loss, so there is nothing for it to offset.

This is a view of the data, not tax advice. Czech law aggregates gains and
losses from securities sales within the same tax year (§10 "ostatní
příjmy"), so a loss realised on one still-taxable lot can offset a gain
realised on another within the same year — but the exact treatment depends
on the whole year's activity, and is worth checking with a tax advisor.
"""

from datetime import date

from sqlalchemy.orm import Session

from app.models import User
from app.services import portfolio_view


def build_harvest_view(
    db: Session, user: User, portfolio_ids: list[int] | None = None, today: date | None = None
) -> dict:
    today = today or date.today()
    view = portfolio_view.build_view(db, user, portfolio_ids=portfolio_ids, allow_fetch=False, today=today)

    candidates = []
    for position in view.positions:
        for lot in position.lots:
            if lot.tax_test_status == "passed":
                continue
            if lot.gain_czk is None or lot.gain_czk >= 0:
                continue
            candidates.append(
                {
                    "instrument_key": position.instrument_key,
                    "ticker": position.ticker,
                    "lot_date": lot.date,
                    "quantity": lot.quantity,
                    "unrealized_loss_czk": lot.gain_czk,
                    "tax_test_status": lot.tax_test_status,
                    "tax_test_days_remaining": lot.tax_test_days_remaining,
                }
            )
    candidates.sort(key=lambda c: c["unrealized_loss_czk"])  # biggest loss first

    taxable_gain_ytd = sum(
        sale["gain_czk"]
        for position in view.positions
        for sale in position.sales
        if sale["date"].startswith(str(today.year)) and not sale["tax_test_passed"]
    )

    return {"taxable_gain_ytd_czk": taxable_gain_ytd, "candidates": candidates}
