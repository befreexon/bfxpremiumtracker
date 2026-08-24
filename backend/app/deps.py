"""Shared FastAPI dependencies."""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Portfolio, User
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Přihlášení vypršelo nebo je neplatné. Přihlas se znovu.",
    headers={"WWW-Authenticate": "Bearer"},
)


def current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    user_id = decode_access_token(token)
    if user_id is None:
        raise CREDENTIALS_ERROR
    user = db.get(User, user_id)
    if user is None:
        raise CREDENTIALS_ERROR
    return user


def owned_portfolio(portfolio_id: int, user: User, db: Session) -> Portfolio:
    """Loads a portfolio, refusing anything that is not the caller's."""
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None or portfolio.user_id != user.id:
        raise HTTPException(status_code=404, detail="Portfolio nenalezeno.")
    return portfolio
