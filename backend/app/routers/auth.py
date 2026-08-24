"""Registration, sign-in and per-user settings.

Sign-out is a client-side act: the token is dropped. The endpoint exists so the
front end has something explicit to call, and so a future token blocklist has a
place to live.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import Portfolio, User
from app.schemas import (
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserSettingsUpdate,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _as_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        tax_test_years=user.tax_test_years,
        tax_exempt_cap_czk=user.tax_exempt_cap_czk,
        benchmark_ticker=user.benchmark_ticker,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Účet s tímto e-mailem už existuje.")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
    )
    db.add(user)
    db.flush()
    # Somewhere to put the first transaction without a setup step first.
    db.add(Portfolio(user_id=user.id, name="Hlavní"))
    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> TokenResponse:
    user = db.query(User).filter(User.email == form.username.lower().strip()).first()
    if user is None or not verify_password(form.password, user.password_hash):
        # One message for both cases, so the form cannot be used to discover
        # which e-mail addresses have accounts.
        raise HTTPException(status_code=401, detail="Nesprávný e-mail nebo heslo.")
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(user: User = Depends(current_user)) -> None:
    return None


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(current_user)) -> UserResponse:
    return _as_response(user)


@router.patch("/me", response_model=UserResponse)
def update_settings(
    payload: UserSettingsUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return _as_response(user)
