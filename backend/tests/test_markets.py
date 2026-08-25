"""The small "Trhy" overview: pure day-change math, plus that the API route
requires auth and shapes its response the way the frontend expects."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.services.markets import WATCHLIST, MarketQuote, build_quote


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
        json={"email": "trhy@example.com", "password": "tajneheslo123", "display_name": "Trhy"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def test_change_pct_is_measured_against_the_previous_close():
    quote = build_quote("sp500", "S&P 500", "USD", price=110.0, previous_close=100.0)

    assert quote.change_pct == pytest.approx(10.0)
    assert quote.error is None


def test_a_missing_price_is_reported_not_fabricated():
    quote = build_quote("gold", "Zlato", "USD", price=None, previous_close=1900.0)

    assert quote.price is None
    assert quote.change_pct is None
    assert quote.error is not None


def test_a_price_without_a_previous_close_has_no_change_but_is_not_an_error():
    quote = build_quote("bitcoin", "Bitcoin", "USD", price=64000.0, previous_close=None)

    assert quote.price == pytest.approx(64000.0)
    assert quote.change_pct is None
    assert quote.error is None


def test_the_watchlist_keys_are_unique():
    keys = [row[0] for row in WATCHLIST]
    assert len(keys) == len(set(keys))


def test_markets_overview_requires_auth(client):
    response = client.get("/api/markets/overview")
    assert response.status_code == 401


def test_markets_overview_is_shaped_for_the_frontend(client, monkeypatch):
    token = register(client)
    fake = [MarketQuote(key="sp500", label="S&P 500", price=100.0, change_pct=1.5, currency="USD")]
    monkeypatch.setattr("app.routers.markets.markets_service.fetch_overview", lambda: fake)

    response = client.get("/api/markets/overview", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == [
        {"key": "sp500", "label": "S&P 500", "price": 100.0, "change_pct": 1.5, "currency": "USD", "error": None}
    ]
