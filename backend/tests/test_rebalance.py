"""Target-allocation rebalancing: set targets by asset class, get a buy/sell
suggestion back for the gap between that and today's actual split."""

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
        json={"email": "reb@example.com", "password": "tajneheslo123", "display_name": "Test"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def add_transaction(client, token, portfolio_id, **overrides):
    payload = {
        "type": "BUY", "date": "2021-03-15", "ticker": "AAPL", "exchange": "NASDAQ",
        "asset_class": "STOCK", "quantity": 10, "price": 100.0, "currency": "CZK",
        "fee": 0.0, "fx_rate": None,
    }
    payload.update(overrides)
    return client.post(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token), json=payload
    )


def test_targets_can_be_set_and_read_back(client):
    token = register(client)

    saved = client.put(
        "/api/rebalance/targets", headers=auth(token),
        json={"targets": {"STOCK": 80, "ETF": 15, "CRYPTO": 5}},
    )
    assert saved.status_code == 200
    assert saved.json() == {"STOCK": 80, "ETF": 15, "CRYPTO": 5}

    assert client.get("/api/rebalance/targets", headers=auth(token)).json() == {
        "STOCK": 80, "ETF": 15, "CRYPTO": 5,
    }


def test_setting_targets_replaces_the_previous_set(client):
    token = register(client)
    client.put("/api/rebalance/targets", headers=auth(token), json={"targets": {"STOCK": 100}})

    client.put("/api/rebalance/targets", headers=auth(token), json={"targets": {"ETF": 100}})

    assert client.get("/api/rebalance/targets", headers=auth(token)).json() == {"ETF": 100}


def test_an_unknown_asset_class_is_refused(client):
    token = register(client)

    response = client.put(
        "/api/rebalance/targets", headers=auth(token), json={"targets": {"BOND": 100}}
    )

    assert response.status_code == 422


def test_no_targets_means_no_suggestions(client):
    token = register(client)

    result = client.get("/api/rebalance", headers=auth(token)).json()

    assert result == {"targets_sum_pct": 0.0, "suggestions": []}


def test_a_suggestion_says_how_much_to_buy_or_sell_to_reach_target(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    # 10 shares @ 100 CZK = 1000 CZK, all in STOCK.
    add_transaction(client, token, portfolio_id)
    client.put(
        "/api/prices/manual", headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 100.0},
    )
    client.put(
        "/api/rebalance/targets", headers=auth(token),
        json={"targets": {"STOCK": 50, "CRYPTO": 50}},
    )

    result = client.get("/api/rebalance", headers=auth(token)).json()

    assert result["targets_sum_pct"] == pytest.approx(100.0)
    by_class = {s["asset_class"]: s for s in result["suggestions"]}
    # STOCK is 100% of the portfolio today but only targeted at 50% -> sell half.
    assert by_class["STOCK"]["current_pct"] == pytest.approx(100.0)
    assert by_class["STOCK"]["delta_czk"] == pytest.approx(-500.0)
    # CRYPTO is targeted at 50% but holds nothing today -> buy into it.
    assert by_class["CRYPTO"]["current_pct"] == pytest.approx(0.0)
    assert by_class["CRYPTO"]["delta_czk"] == pytest.approx(500.0)


def test_targets_not_summing_to_100_are_still_returned_for_the_frontend_to_flag(client):
    token = register(client)
    client.put("/api/rebalance/targets", headers=auth(token), json={"targets": {"STOCK": 60}})

    result = client.get("/api/rebalance", headers=auth(token)).json()

    assert result["targets_sum_pct"] == pytest.approx(60.0)
