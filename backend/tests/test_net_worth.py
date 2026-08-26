"""Net worth: securities value (across every portfolio) plus manual assets
the user values by hand — cash, real estate, anything else."""

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


def register(client, email="networth@example.com") -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "tajneheslo123", "display_name": "Test"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_net_worth_is_zero_with_nothing_recorded(client):
    token = register(client)

    result = client.get("/api/net-worth", headers=auth(token)).json()

    assert result == {
        "securities_value_czk": 0.0, "manual_assets": [], "manual_assets_total_czk": 0.0,
        "net_worth_czk": 0.0,
    }


def test_a_manual_asset_can_be_added_and_counts_toward_net_worth(client):
    token = register(client)

    created = client.post(
        "/api/net-worth/assets", headers=auth(token),
        json={"name": "Byt", "category": "real_estate", "value_czk": 5_000_000.0},
    )
    assert created.status_code == 201
    assert created.json()["category"] == "REAL_ESTATE"

    result = client.get("/api/net-worth", headers=auth(token)).json()

    assert result["manual_assets_total_czk"] == pytest.approx(5_000_000.0)
    assert result["net_worth_czk"] == pytest.approx(5_000_000.0)


def test_a_manual_asset_can_be_revalued(client):
    token = register(client)
    asset_id = client.post(
        "/api/net-worth/assets", headers=auth(token),
        json={"name": "Spořicí účet", "category": "cash", "value_czk": 100_000.0},
    ).json()["id"]

    updated = client.patch(
        f"/api/net-worth/assets/{asset_id}", headers=auth(token), json={"value_czk": 120_000.0}
    )

    assert updated.json()["value_czk"] == pytest.approx(120_000.0)
    assert updated.json()["name"] == "Spořicí účet"  # untouched fields survive a partial update


def test_a_manual_asset_can_be_deleted(client):
    token = register(client)
    asset_id = client.post(
        "/api/net-worth/assets", headers=auth(token),
        json={"name": "Auto", "category": "other", "value_czk": 300_000.0},
    ).json()["id"]

    deleted = client.delete(f"/api/net-worth/assets/{asset_id}", headers=auth(token))

    assert deleted.status_code == 204
    assert client.get("/api/net-worth", headers=auth(token)).json()["manual_assets"] == []


def test_an_unknown_category_is_refused(client):
    token = register(client)

    response = client.post(
        "/api/net-worth/assets", headers=auth(token),
        json={"name": "X", "category": "CRYPTO_WALLET", "value_czk": 1.0},
    )

    assert response.status_code == 422


def test_one_account_cannot_touch_anothers_manual_asset(client):
    mine = register(client, email="mine@example.com")
    theirs = register(client, email="theirs@example.com")
    asset_id = client.post(
        "/api/net-worth/assets", headers=auth(mine),
        json={"name": "Moje hotovost", "category": "cash", "value_czk": 1000.0},
    ).json()["id"]

    response = client.patch(
        f"/api/net-worth/assets/{asset_id}", headers=auth(theirs), json={"value_czk": 2.0}
    )

    assert response.status_code == 404
