"""Tax-loss harvesting candidates: only lots still within the holding-period
test, still at an unrealized loss, count — an already-exempt lot is excluded
since its result never enters the taxable base either way."""

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
        json={"email": "harvest@example.com", "password": "tajneheslo123", "display_name": "Test"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def add_transaction(client, token, portfolio_id, **overrides):
    payload = {
        "type": "BUY", "date": "2025-01-10", "ticker": "AAPL", "exchange": "NASDAQ",
        "asset_class": "STOCK", "quantity": 10, "price": 200.0, "currency": "CZK",
        "fee": 0.0, "fx_rate": None,
    }
    payload.update(overrides)
    return client.post(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token), json=payload
    )


def test_no_positions_means_no_candidates(client):
    token = register(client)

    result = client.get("/api/tax-loss", headers=auth(token)).json()

    assert result == {"taxable_gain_ytd_czk": 0.0, "candidates": []}


def test_a_recent_lot_at_a_loss_is_a_candidate(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, price=200.0, quantity=10, date="2025-01-10")
    client.put(
        "/api/prices/manual", headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 150.0},
    )

    result = client.get("/api/tax-loss", headers=auth(token)).json()

    assert len(result["candidates"]) == 1
    candidate = result["candidates"][0]
    assert candidate["ticker"] == "AAPL"
    assert candidate["unrealized_loss_czk"] == pytest.approx(-500.0)
    assert candidate["tax_test_status"] != "passed"


def test_a_lot_currently_at_a_gain_is_not_a_candidate(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, price=100.0, quantity=10)
    client.put(
        "/api/prices/manual", headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 150.0},
    )

    result = client.get("/api/tax-loss", headers=auth(token)).json()

    assert result["candidates"] == []


def test_a_lot_that_already_passed_the_tax_test_is_not_a_candidate_even_at_a_loss(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, price=200.0, quantity=10, date="2015-01-10")
    client.put(
        "/api/prices/manual", headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 150.0},
    )

    result = client.get("/api/tax-loss", headers=auth(token)).json()

    assert result["candidates"] == []


def test_taxable_gain_ytd_sums_only_this_years_pre_exemption_sales(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    from datetime import date

    year = date.today().year
    # Bought this year, sold this year at a gain, well within the exemption window.
    add_transaction(client, token, portfolio_id, price=100.0, quantity=10, date=f"{year}-01-05")
    client.post(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token),
        json={
            "type": "SELL", "date": f"{year}-06-01", "ticker": "AAPL", "exchange": "NASDAQ",
            "asset_class": "STOCK", "quantity": 10, "price": 150.0, "currency": "CZK", "fee": 0.0,
        },
    )

    result = client.get("/api/tax-loss", headers=auth(token)).json()

    assert result["taxable_gain_ytd_czk"] == pytest.approx(500.0)
