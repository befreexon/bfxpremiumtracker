"""The demo account: seeded once, idempotent, and every screen it touches
renders without error."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Portfolio, Segment, SegmentMember, Snapshot, TickerNote, Transaction, User, WatchlistItem
from app.seed import DEMO_EMAIL, DEMO_PASSWORD, seed_demo_account


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)

    def override():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def db_session(client):
    # Re-derive a session bound to the same in-memory engine the client uses.
    override = app.dependency_overrides[get_db]
    gen = override()
    session = next(gen)
    try:
        yield session
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_seeding_is_idempotent(db_session):
    seed_demo_account(db_session)
    seed_demo_account(db_session)

    assert db_session.query(User).filter(User.email == DEMO_EMAIL).count() == 1


def test_seeding_populates_every_layer_the_demo_should_show(db_session):
    seed_demo_account(db_session)
    user = db_session.query(User).filter(User.email == DEMO_EMAIL).one()

    assert db_session.query(Portfolio).filter(Portfolio.user_id == user.id).count() == 2
    assert db_session.query(Transaction).count() > 0
    assert db_session.query(WatchlistItem).filter(WatchlistItem.user_id == user.id).count() == 3
    assert db_session.query(Segment).filter(Segment.user_id == user.id).count() == 2
    assert db_session.query(SegmentMember).filter(SegmentMember.user_id == user.id).count() == 5
    assert db_session.query(Snapshot).count() == 4
    assert db_session.query(TickerNote).filter(TickerNote.user_id == user.id).count() == 1


def test_the_demo_account_can_log_in_and_every_screen_it_touches_loads(client, db_session):
    seed_demo_account(db_session)

    login = client.post(
        "/api/auth/login", data={"username": DEMO_EMAIL, "password": DEMO_PASSWORD}
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    overview = client.get("/api/overview", headers=auth(token))
    assert overview.status_code == 200
    body = overview.json()
    assert body["position_count"] > 0
    assert body["ytd_gain_pct"] is not None  # a snapshot exists this year
    assert len(body["allocation_by_segment"]) > 0
    assert len(body["upcoming_dividends"]) > 0
    assert body["trailing_12m_dividends_czk"] > 0

    for path in (
        "/api/watchlist",
        "/api/segments",
        "/api/transactions",
        "/api/snapshots",
        "/api/portfolios",
    ):
        response = client.get(path, headers=auth(token))
        assert response.status_code == 200, f"{path} -> {response.status_code}: {response.text}"
