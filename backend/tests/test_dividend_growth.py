"""Year-over-year dividend growth per instrument: trailing 12 months against
the 12 months before that, computed purely from the user's own recorded DIV
transactions — no market data involved, so this is fully testable end to end."""

from datetime import date, timedelta

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


def register(client) -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": "grower@example.com", "password": "tajneheslo123", "display_name": "Test"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def add_transaction(client, token, portfolio_id, **overrides):
    payload = {
        "type": "BUY",
        "date": "2015-01-01",
        "ticker": "AAPL",
        "exchange": "NASDAQ",
        "asset_class": "STOCK",
        "quantity": 20,
        "price": 100.0,
        "currency": "CZK",
        "fee": 0.0,
        "fx_rate": None,
    }
    payload.update(overrides)
    return client.post(f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token), json=payload)


def add_dividend(client, token, portfolio_id, **overrides):
    payload = {
        "type": "DIV",
        "date": date.today().isoformat(),
        "ticker": "AAPL",
        "exchange": "NASDAQ",
        "asset_class": "STOCK",
        "quantity": 1,
        "price": 100.0,
        "currency": "CZK",
        "fee": 0.0,
        "fx_rate": None,
    }
    payload.update(overrides)
    return client.post(f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token), json=payload)


def test_growth_rate_compares_the_two_trailing_windows(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id)

    recent = (date.today() - timedelta(days=30)).isoformat()
    older = (date.today() - timedelta(days=400)).isoformat()
    add_dividend(client, token, portfolio_id, date=recent, price=150.0)
    add_dividend(client, token, portfolio_id, date=older, price=100.0)

    overview = client.get("/api/overview", headers=auth(token)).json()
    growth = overview["dividend_growth"]

    assert len(growth) == 1
    assert growth[0]["ticker"] == "AAPL"
    assert growth[0]["trailing_12m_czk"] == pytest.approx(150.0)
    assert growth[0]["prior_12m_czk"] == pytest.approx(100.0)
    assert growth[0]["growth_pct"] == pytest.approx(50.0)


def test_a_new_payer_with_no_prior_window_has_no_rate(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id)
    add_dividend(client, token, portfolio_id, price=80.0)

    overview = client.get("/api/overview", headers=auth(token)).json()
    growth = overview["dividend_growth"]

    assert len(growth) == 1
    assert growth[0]["trailing_12m_czk"] == pytest.approx(80.0)
    assert growth[0]["prior_12m_czk"] == 0.0
    assert growth[0]["growth_pct"] is None


def test_a_payment_more_than_two_years_old_does_not_count_at_all(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id)
    ancient = (date.today() - timedelta(days=900)).isoformat()
    add_dividend(client, token, portfolio_id, date=ancient, price=500.0)

    overview = client.get("/api/overview", headers=auth(token)).json()

    assert overview["dividend_growth"] == []


def test_growth_list_covers_every_ticker_that_paid_in_either_window(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, ticker="AAPL")
    add_transaction(client, token, portfolio_id, ticker="MSFT")

    recent = (date.today() - timedelta(days=10)).isoformat()
    older = (date.today() - timedelta(days=400)).isoformat()
    # AAPL paid recently only (new payer); MSFT paid in the prior window only (stopped paying).
    add_dividend(client, token, portfolio_id, ticker="AAPL", date=recent, price=60.0)
    add_dividend(client, token, portfolio_id, ticker="MSFT", date=older, price=40.0)

    overview = client.get("/api/overview", headers=auth(token)).json()
    by_ticker = {row["ticker"]: row for row in overview["dividend_growth"]}

    assert by_ticker["AAPL"]["trailing_12m_czk"] == pytest.approx(60.0)
    assert by_ticker["AAPL"]["growth_pct"] is None

    # MSFT still has a baseline to compare against, so a drop to zero is a
    # real -100% rather than an undefined one.
    assert by_ticker["MSFT"]["trailing_12m_czk"] == pytest.approx(0.0)
    assert by_ticker["MSFT"]["prior_12m_czk"] == pytest.approx(40.0)
    assert by_ticker["MSFT"]["growth_pct"] == pytest.approx(-100.0)
