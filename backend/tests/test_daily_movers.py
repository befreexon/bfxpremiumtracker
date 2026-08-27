"""Today's biggest movers: pure day-change math, plus that the API route
requires auth and only looks at open positions."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.services.daily_movers import Mover, build_movers, compute_move


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


def register(client) -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": "movers@example.com", "password": "tajneheslo123", "display_name": "Test"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_the_move_is_measured_against_the_previous_close():
    mover = compute_move("AAPL|NASDAQ|USD", "AAPL", "USD", price=110.0, previous_close=100.0, quantity=10, fx_rate=22.0)

    assert mover.move_pct == pytest.approx(10.0)
    # (110 - 100) * 10 shares * 22 CZK/USD
    assert mover.move_czk == pytest.approx(2200.0)
    assert mover.error is None


def test_a_missing_price_is_reported_not_fabricated():
    mover = compute_move("AAPL|NASDAQ|USD", "AAPL", "USD", price=None, previous_close=100.0, quantity=10, fx_rate=22.0)

    assert mover.price is None
    assert mover.move_pct is None
    assert mover.error is not None


def test_a_zero_previous_close_does_not_divide_by_zero():
    mover = compute_move("XYZ|NASDAQ|USD", "XYZ", "USD", price=5.0, previous_close=0.0, quantity=1, fx_rate=22.0)

    assert mover.move_pct is None
    assert mover.error is not None


def test_the_move_stays_in_native_currency_without_a_known_fx_rate():
    mover = compute_move("AAPL|NASDAQ|USD", "AAPL", "USD", price=110.0, previous_close=100.0, quantity=10, fx_rate=None)

    assert mover.move_pct == pytest.approx(10.0)
    assert mover.move_czk is None


def test_movers_requires_auth(client):
    assert client.get("/api/movers").status_code == 401


def test_movers_is_empty_without_any_open_position(client):
    token = register(client)

    assert client.get("/api/movers", headers=auth(token)).json() == []


def test_movers_route_is_shaped_for_the_frontend(client, monkeypatch):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    client.post(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token),
        json={
            "type": "BUY", "date": "2024-01-01", "ticker": "AAPL", "exchange": "NASDAQ",
            "asset_class": "STOCK", "quantity": 10, "price": 100.0, "currency": "CZK", "fee": 0.0,
        },
    )
    client.put(
        "/api/prices/manual", headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 110.0},
    )

    fake = [Mover(instrument_key="AAPL|NASDAQ|CZK", ticker="AAPL", currency="CZK", price=110.0, move_pct=5.0, move_czk=50.0)]
    monkeypatch.setattr("app.routers.movers.build_movers", lambda holdings: fake)

    response = client.get("/api/movers", headers=auth(token))

    assert response.status_code == 200
    assert response.json() == [
        {"instrument_key": "AAPL|NASDAQ|CZK", "ticker": "AAPL", "currency": "CZK", "price": 110.0, "move_pct": 5.0, "move_czk": 50.0, "error": None}
    ]


def test_build_movers_calls_one_fetch_per_holding(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.services.daily_movers._fetch_one",
        lambda **kwargs: calls.append(kwargs) or Mover(instrument_key="x", ticker=kwargs["ticker"], currency=None, price=None, move_pct=None, move_czk=None),
    )

    build_movers(
        [
            {"ticker": "AAPL", "exchange": "NASDAQ", "currency": "USD", "asset_class": "STOCK", "quantity": 1, "fx_rate": 22.0},
            {"ticker": "MSFT", "exchange": "NASDAQ", "currency": "USD", "asset_class": "STOCK", "quantity": 2, "fx_rate": 22.0},
        ]
    )

    assert len(calls) == 2
