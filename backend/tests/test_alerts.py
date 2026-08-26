"""The alerts inbox: one feed pulling together watchlist targets, portfolio
concentration, missing price/FX, and tax-test lots about to clear — each
alert type checked independently, and that unrelated data stays quiet."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


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


def register(client, email="alerts@example.com") -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "tajneheslo123", "display_name": "Test"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def add_transaction(client, token, portfolio_id, **overrides):
    payload = {
        "type": "BUY", "date": "2021-03-15", "ticker": "AAPL", "exchange": "NASDAQ",
        "asset_class": "STOCK", "quantity": 20, "price": 120.5, "currency": "USD",
        "fee": 8.5, "fx_rate": 21.85,
    }
    payload.update(overrides)
    return client.post(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token), json=payload
    )


def test_alerts_requires_auth(client):
    assert client.get("/api/alerts").status_code == 401


def test_an_empty_portfolio_has_no_alerts(client):
    token = register(client)
    assert client.get("/api/alerts", headers=auth(token)).json() == []


def test_a_dominant_position_raises_a_concentration_alert(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, ticker="AAPL", currency="CZK", fx_rate=None, price=100.0, quantity=10)
    client.put(
        "/api/prices/manual", headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 100.0},
    )

    alerts = client.get("/api/alerts", headers=auth(token)).json()

    assert any(a["type"] == "concentration" for a in alerts)


def test_a_missing_price_raises_an_alert(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id)

    alerts = client.get("/api/alerts", headers=auth(token)).json()

    assert any(a["type"] == "missing_price" for a in alerts)


def test_a_missing_fx_rate_raises_an_alert(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, fx_rate=None)

    alerts = client.get("/api/alerts", headers=auth(token)).json()

    assert any(a["type"] == "missing_fx" for a in alerts)


def test_a_watchlist_title_at_its_target_raises_a_success_alert(client):
    token = register(client)
    client.post(
        "/api/watchlist", headers=auth(token),
        json={"ticker": "MSFT", "exchange": "NASDAQ", "currency": "USD", "target_price": 300.0},
    )
    client.put(
        "/api/prices/manual", headers=auth(token),
        json={"instrument_key": "MSFT|NASDAQ|USD", "price": 250.0},
    )

    alerts = client.get("/api/alerts", headers=auth(token)).json()

    watchlist_alerts = [a for a in alerts if a["type"] == "watchlist_target"]
    assert len(watchlist_alerts) == 1
    assert watchlist_alerts[0]["severity"] == "success"


def test_a_watchlist_title_still_above_target_raises_nothing(client):
    token = register(client)
    client.post(
        "/api/watchlist", headers=auth(token),
        json={"ticker": "MSFT", "exchange": "NASDAQ", "currency": "USD", "target_price": 100.0},
    )
    client.put(
        "/api/prices/manual", headers=auth(token),
        json={"instrument_key": "MSFT|NASDAQ|USD", "price": 250.0},
    )

    alerts = client.get("/api/alerts", headers=auth(token)).json()

    assert not any(a["type"] == "watchlist_target" for a in alerts)


def test_alerts_can_be_narrowed_to_one_portfolio(client):
    token = register(client)
    portfolios = client.get("/api/portfolios", headers=auth(token)).json()
    main_id = portfolios[0]["id"]
    second_id = client.post(
        "/api/portfolios", headers=auth(token), json={"name": "Druhé"}
    ).json()["id"]
    add_transaction(client, token, second_id)  # missing price, in the *other* portfolio

    alerts = client.get(f"/api/alerts?portfolio_ids={main_id}", headers=auth(token)).json()

    assert alerts == []
