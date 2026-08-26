"""Financial goals: progress and required-return math against today's net
worth, solved directly rather than assumed."""

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
        json={"email": "goals@example.com", "password": "tajneheslo123", "display_name": "Test"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_a_goal_can_be_created_and_listed(client):
    token = register(client)
    target_date = (date.today() + timedelta(days=365)).isoformat()

    created = client.post(
        "/api/goals", headers=auth(token),
        json={"name": "Záloha na byt", "target_value_czk": 1_000_000.0, "target_date": target_date},
    )
    assert created.status_code == 201

    goals = client.get("/api/goals", headers=auth(token)).json()
    assert len(goals) == 1
    assert goals[0]["name"] == "Záloha na byt"


def test_progress_and_required_return_with_no_net_worth_yet(client):
    token = register(client)
    target_date = (date.today() + timedelta(days=365)).isoformat()
    client.post(
        "/api/goals", headers=auth(token),
        json={"name": "Cíl", "target_value_czk": 100_000.0, "target_date": target_date},
    )

    goal = client.get("/api/goals", headers=auth(token)).json()[0]

    assert goal["current_value_czk"] == pytest.approx(0.0)
    assert goal["progress_pct"] == pytest.approx(0.0)
    assert goal["reached"] is False
    # Can't solve a required return from a starting point of zero.
    assert goal["required_annual_return_pct"] is None


def test_required_return_is_solved_from_todays_net_worth(client):
    token = register(client)
    client.post(
        "/api/net-worth/assets", headers=auth(token),
        json={"name": "Hotovost", "category": "cash", "value_czk": 100_000.0},
    )
    target_date = (date.today() + timedelta(days=365)).isoformat()
    client.post(
        "/api/goals", headers=auth(token),
        json={"name": "Zdvojnásobit", "target_value_czk": 200_000.0, "target_date": target_date},
    )

    goal = client.get("/api/goals", headers=auth(token)).json()[0]

    assert goal["current_value_czk"] == pytest.approx(100_000.0)
    assert goal["progress_pct"] == pytest.approx(50.0)
    # ~1 year to double: required return is close to 100%.
    assert goal["required_annual_return_pct"] == pytest.approx(100.0, rel=0.02)


def test_a_goal_already_met_needs_no_further_return(client):
    token = register(client)
    client.post(
        "/api/net-worth/assets", headers=auth(token),
        json={"name": "Hotovost", "category": "cash", "value_czk": 500_000.0},
    )
    target_date = (date.today() + timedelta(days=365)).isoformat()
    client.post(
        "/api/goals", headers=auth(token),
        json={"name": "Snadný cíl", "target_value_czk": 100_000.0, "target_date": target_date},
    )

    goal = client.get("/api/goals", headers=auth(token)).json()[0]

    assert goal["reached"] is True
    assert goal["required_annual_return_pct"] is None


def test_a_goal_can_be_updated_and_deleted(client):
    token = register(client)
    target_date = (date.today() + timedelta(days=365)).isoformat()
    goal_id = client.post(
        "/api/goals", headers=auth(token),
        json={"name": "Cíl", "target_value_czk": 100_000.0, "target_date": target_date},
    ).json()["id"]

    renamed = client.patch(f"/api/goals/{goal_id}", headers=auth(token), json={"name": "Nový název"})
    assert renamed.json()["name"] == "Nový název"

    deleted = client.delete(f"/api/goals/{goal_id}", headers=auth(token))
    assert deleted.status_code == 204
    assert client.get("/api/goals", headers=auth(token)).json() == []


def test_one_account_cannot_touch_anothers_goal(client):
    mine = register(client)
    theirs_token = client.post(
        "/api/auth/register",
        json={"email": "goals2@example.com", "password": "tajneheslo123", "display_name": "Test2"},
    ).json()["access_token"]
    target_date = (date.today() + timedelta(days=365)).isoformat()
    goal_id = client.post(
        "/api/goals", headers=auth(mine),
        json={"name": "Moje", "target_value_czk": 1.0, "target_date": target_date},
    ).json()["id"]

    response = client.delete(f"/api/goals/{goal_id}", headers=auth(theirs_token))

    assert response.status_code == 404
