"""Net worth: securities (from the portfolio engine, across every portfolio)
plus manual assets — cash, real estate, anything else the user values by
hand. There is no "portfolio_ids" scoping here, unlike the rest of the app:
net worth is inherently everything at once."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import ManualAsset, User
from app.schemas import ManualAssetCreate, ManualAssetResponse, ManualAssetUpdate, NetWorthResponse
from app.services import portfolio_view

router = APIRouter(prefix="/api/net-worth", tags=["net-worth"])


def _to_response(asset: ManualAsset) -> ManualAssetResponse:
    return ManualAssetResponse(
        id=asset.id,
        name=asset.name,
        category=asset.category,
        value_czk=asset.value_czk,
        note=asset.note or "",
        updated_at=asset.updated_at,
    )


def _owned_asset(asset_id: int, user: User, db: Session) -> ManualAsset:
    asset = db.get(ManualAsset, asset_id)
    if asset is None or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")
    return asset


@router.get("", response_model=NetWorthResponse)
def get_net_worth(user: User = Depends(current_user), db: Session = Depends(get_db)) -> NetWorthResponse:
    view = portfolio_view.build_view(db, user, portfolio_ids=None, allow_fetch=False)
    assets = db.query(ManualAsset).filter(ManualAsset.user_id == user.id).order_by(ManualAsset.name).all()
    assets_total = sum(asset.value_czk for asset in assets)
    return NetWorthResponse(
        securities_value_czk=view.value_czk,
        manual_assets=[_to_response(asset) for asset in assets],
        manual_assets_total_czk=assets_total,
        net_worth_czk=view.value_czk + assets_total,
    )


@router.post("/assets", response_model=ManualAssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: ManualAssetCreate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> ManualAssetResponse:
    asset = ManualAsset(user_id=user.id, **payload.model_dump())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _to_response(asset)


@router.patch("/assets/{asset_id}", response_model=ManualAssetResponse)
def update_asset(
    asset_id: int,
    payload: ManualAssetUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ManualAssetResponse:
    asset = _owned_asset(asset_id, user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(asset, field, value)
    asset.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(asset)
    return _to_response(asset)


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> None:
    asset = _owned_asset(asset_id, user, db)
    db.delete(asset)
    db.commit()
