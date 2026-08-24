import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Portfolio, User


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def user(db):
    row = User(email="test@example.com", password_hash="x", display_name="Test")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@pytest.fixture()
def portfolio(db, user):
    row = Portfolio(user_id=user.id, name="Hlavní")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
