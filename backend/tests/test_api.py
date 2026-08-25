"""End-to-end walk through the API, from registration to a full overview."""

from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app

SAMPLE_FILE = Path(__file__).resolve().parent.parent / "app" / "static" / "import-vzor.csv"


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


def register(client, email="ondrej@example.com", password="tajneheslo123"):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": "Ondřej"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# --- Accounts --------------------------------------------------------------


def test_registering_creates_an_account_with_a_portfolio_ready_to_use(client):
    token = register(client)

    portfolios = client.get("/api/portfolios", headers=auth(token)).json()

    assert [p["name"] for p in portfolios] == ["Hlavní"]


def test_the_same_email_cannot_register_twice(client):
    register(client)

    response = client.post(
        "/api/auth/register",
        json={"email": "ondrej@example.com", "password": "jineheslo123"},
    )

    assert response.status_code == 409


def test_signing_in_with_the_right_password_returns_a_token(client):
    register(client)

    response = client.post(
        "/api/auth/login",
        data={"username": "ondrej@example.com", "password": "tajneheslo123"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_a_wrong_password_is_refused_without_revealing_which_half_was_wrong(client):
    register(client)

    wrong_password = client.post(
        "/api/auth/login", data={"username": "ondrej@example.com", "password": "spatne"}
    )
    unknown_email = client.post(
        "/api/auth/login", data={"username": "nikdo@example.com", "password": "tajneheslo123"}
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json()["detail"] == unknown_email.json()["detail"]


def test_the_api_is_closed_without_a_token(client):
    assert client.get("/api/portfolios").status_code == 401
    assert client.get("/api/overview").status_code == 401


def test_settings_can_be_changed(client):
    token = register(client)

    response = client.patch(
        "/api/auth/me", headers=auth(token), json={"tax_test_years": 5, "benchmark_ticker": "CSPX"}
    )

    assert response.json()["tax_test_years"] == 5
    assert response.json()["benchmark_ticker"] == "CSPX"


# --- Isolation between accounts -------------------------------------------


def test_one_account_cannot_see_or_touch_anothers_portfolio(client):
    mine = register(client, "ja@example.com")
    theirs = register(client, "nekdo@example.com")
    their_portfolio = client.get("/api/portfolios", headers=auth(theirs)).json()[0]

    read = client.get(
        f"/api/portfolios/{their_portfolio['id']}/transactions", headers=auth(mine)
    )
    delete = client.delete(f"/api/portfolios/{their_portfolio['id']}", headers=auth(mine))

    assert read.status_code == 404
    assert delete.status_code == 404


# --- Portfolios ------------------------------------------------------------


def test_several_portfolios_can_be_kept_side_by_side(client):
    token = register(client)

    client.post("/api/portfolios", headers=auth(token), json={"name": "Krypto"})
    client.post("/api/portfolios", headers=auth(token), json={"name": "Penze"})

    names = [p["name"] for p in client.get("/api/portfolios", headers=auth(token)).json()]
    assert names == ["Hlavní", "Krypto", "Penze"]


def test_two_portfolios_cannot_share_a_name(client):
    token = register(client)
    client.post("/api/portfolios", headers=auth(token), json={"name": "Krypto"})

    response = client.post("/api/portfolios", headers=auth(token), json={"name": "Krypto"})

    assert response.status_code == 409


def test_the_last_portfolio_cannot_be_deleted(client):
    token = register(client)
    only = client.get("/api/portfolios", headers=auth(token)).json()[0]

    response = client.delete(f"/api/portfolios/{only['id']}", headers=auth(token))

    assert response.status_code == 400
    assert "Poslední portfolio" in response.json()["detail"]


# --- Transactions ----------------------------------------------------------


def add_transaction(client, token, portfolio_id, **overrides):
    payload = {
        "type": "BUY",
        "date": "2021-03-15",
        "ticker": "AAPL",
        "exchange": "NASDAQ",
        "asset_class": "STOCK",
        "quantity": 20,
        "price": 120.5,
        "currency": "USD",
        "fee": 8.5,
        "fx_rate": 21.85,
    }
    payload.update(overrides)
    return client.post(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token), json=payload
    )


def test_a_transaction_can_be_added_edited_and_removed(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]

    created = add_transaction(client, token, portfolio_id)
    assert created.status_code == 201
    tx_id = created.json()["id"]

    edited = client.patch(
        f"/api/portfolios/{portfolio_id}/transactions/{tx_id}",
        headers=auth(token),
        json={"quantity": 25},
    )
    assert edited.json()["quantity"] == 25

    removed = client.delete(
        f"/api/portfolios/{portfolio_id}/transactions/{tx_id}", headers=auth(token)
    )
    assert removed.status_code == 204
    assert client.get(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token)
    ).json() == []


def test_an_unknown_transaction_type_is_refused(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]

    response = add_transaction(client, token, portfolio_id, type="SPLIT")

    assert response.status_code == 422


# --- Overview --------------------------------------------------------------


def test_the_overview_reports_a_position_and_flags_the_missing_price(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id)

    overview = client.get("/api/overview", headers=auth(token)).json()

    assert len(overview["positions"]) == 1
    position = overview["positions"][0]
    assert position["ticker"] == "AAPL"
    assert position["quantity"] == 20
    # No price could be fetched offline, so it is reported as missing rather
    # than filled in with something plausible.
    assert position["missing_price"] is True
    assert position["value_czk"] is None
    assert overview["positions_missing_price"] == ["AAPL|NASDAQ|USD"]


def test_a_manual_price_makes_the_position_computable(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, currency="CZK", fx_rate=None, price=100.0)

    client.put(
        "/api/prices/manual",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 150.0},
    )
    overview = client.get("/api/overview", headers=auth(token)).json()

    position = overview["positions"][0]
    assert position["price_is_manual"] is True
    assert position["value_czk"] == pytest.approx(20 * 150.0)
    assert position["total_gain_czk"] == pytest.approx(20 * 150.0 - (20 * 100.0 + 8.5))


def test_the_overview_can_be_narrowed_to_one_portfolio(client):
    token = register(client)
    first = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    second = client.post(
        "/api/portfolios", headers=auth(token), json={"name": "Krypto"}
    ).json()["id"]
    add_transaction(client, token, first)
    add_transaction(client, token, second, ticker="BTC", exchange="CRYPTO", asset_class="CRYPTO")

    everything = client.get("/api/overview", headers=auth(token)).json()
    just_crypto = client.get(
        "/api/overview", headers=auth(token), params={"portfolio_ids": [second]}
    ).json()

    assert len(everything["positions"]) == 2
    assert [p["ticker"] for p in just_crypto["positions"]] == ["BTC"]


# --- CSV round trip --------------------------------------------------------


def import_sample(client, token):
    preview = client.post(
        "/api/import/preview",
        headers=auth(token),
        files={"file": ("vzor.csv", SAMPLE_FILE.read_bytes(), "text/csv")},
    ).json()
    committed = client.post(
        "/api/import/commit", headers=auth(token), json={"token": preview["token"]}
    ).json()
    return preview, committed


def test_the_sample_file_previews_clean_and_then_imports(client):
    token = register(client)

    preview, committed = import_sample(client, token)

    assert preview["fatal_error"] is None
    assert preview["counts"]["error"] == 0
    assert committed["imported"] == 13
    assert committed["created_portfolios"] == ["Krypto"]


def test_the_import_creates_the_portfolio_the_file_referred_to(client):
    token = register(client)

    import_sample(client, token)

    names = [p["name"] for p in client.get("/api/portfolios", headers=auth(token)).json()]
    assert set(names) == {"Hlavní", "Krypto"}


def test_the_imported_positions_carry_lots_splits_and_dividends(client):
    token = register(client)
    import_sample(client, token)

    positions = {
        p["ticker"]: p for p in client.get("/api/overview", headers=auth(token)).json()["positions"]
    }

    # Two buys of 30 shares, 12 sold: 18 left across the surviving lots.
    assert positions["AAPL"]["quantity"] == pytest.approx(18)
    assert positions["AAPL"]["dividends"]
    assert positions["AAPL"]["sales"]
    # 8 shares through a 4:1 split.
    assert positions["NVDA"]["quantity"] == pytest.approx(32)
    assert positions["NVDA"]["splits"][0]["ratio"] == pytest.approx(4)
    # The assigned put: the premium collected lowers the basis.
    assert positions["MSFT"]["cost_czk"] == pytest.approx((100 * 250 - 1850) * 22.30)


def test_a_reimport_of_the_same_file_changes_nothing(client):
    token = register(client)
    import_sample(client, token)

    _, second = import_sample(client, token)

    assert second["imported"] == 0


def test_the_export_can_be_downloaded_and_read_back(client):
    token = register(client)
    import_sample(client, token)

    exported = client.get("/api/export.csv", headers=auth(token))

    assert exported.status_code == 200
    assert exported.text.splitlines()[0].startswith("typ,datum,ticker")
    assert len(exported.text.strip().splitlines()) == 14  # header plus 13 rows


def test_the_import_template_is_downloadable(client):
    assert client.get("/api/import/template.csv").status_code == 200
    assert client.get("/api/import/template.csv", params={"sample": True}).status_code == 200


def test_a_stale_preview_token_is_refused(client):
    token = register(client)

    response = client.post(
        "/api/import/commit", headers=auth(token), json={"token": "neplatny-token"}
    )

    assert response.status_code == 410


# --- Watchlist -------------------------------------------------------------


def add_watchlist_item(client, token, **overrides):
    payload = {
        "ticker": "NVDA",
        "exchange": "NASDAQ",
        "currency": "USD",
        "target_price": 90.0,
        "note": "Počkám na korekci",
    }
    payload.update(overrides)
    return client.post("/api/watchlist", headers=auth(token), json=payload)


def test_a_watchlist_item_needs_a_target_price(client):
    token = register(client)

    response = client.post(
        "/api/watchlist",
        headers=auth(token),
        json={"ticker": "NVDA", "exchange": "NASDAQ", "currency": "USD"},
    )

    assert response.status_code == 422


def test_a_watchlist_item_is_created_with_its_note_and_target(client):
    token = register(client)

    response = add_watchlist_item(client, token)

    assert response.status_code == 201
    assert response.json()["target_price"] == 90.0
    assert response.json()["note"] == "Počkám na korekci"


def test_the_same_title_cannot_be_watched_twice(client):
    token = register(client)
    add_watchlist_item(client, token)

    response = add_watchlist_item(client, token)

    assert response.status_code == 409


def test_buying_a_watched_title_creates_a_position_and_archives_the_entry(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    item_id = add_watchlist_item(client, token).json()["id"]

    response = client.post(
        f"/api/watchlist/{item_id}/buy",
        headers=auth(token),
        json={
            "portfolio_id": portfolio_id,
            "date": "2024-03-01",
            "quantity": 10,
            "price": 88.0,
            "fx_rate": 23.1,
        },
    )

    assert response.status_code == 201
    assert response.json()["archived"] is True
    assert client.get("/api/watchlist", headers=auth(token)).json() == []

    transactions = client.get(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token)
    ).json()
    assert transactions[0]["ticker"] == "NVDA"
    # The reason for the purchase travels with it.
    assert transactions[0]["note"] == "Počkám na korekci"


def test_the_archived_entry_remembers_where_the_position_went(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    item_id = add_watchlist_item(client, token).json()["id"]
    client.post(
        f"/api/watchlist/{item_id}/buy",
        headers=auth(token),
        json={"portfolio_id": portfolio_id, "date": "2024-03-01", "quantity": 10, "price": 88.0},
    )

    archived = client.get(
        "/api/watchlist", headers=auth(token), params={"include_archived": True}
    ).json()

    assert archived[0]["moved_to_portfolio_id"] == portfolio_id
    assert archived[0]["archived_at"] is not None


def test_the_default_groups_are_offered(client):
    token = register(client)

    groups = client.get("/api/watchlist/groups", headers=auth(token)).json()

    assert groups[:3] == ["Čekám na vstup", "Sleduji", "Zamítnuto"]


# --- Snapshots -------------------------------------------------------------


def test_a_snapshot_records_where_the_portfolio_stands(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, currency="CZK", fx_rate=None, price=100.0)
    client.put(
        "/api/prices/manual",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 150.0},
    )

    client.post("/api/snapshots", headers=auth(token))
    history = client.get("/api/snapshots", headers=auth(token)).json()

    assert len(history) == 1
    assert history[0]["value_czk"] == pytest.approx(3000.0)
    assert history[0]["date"] == date.today().replace(day=1).isoformat()


def test_taking_a_snapshot_twice_in_a_month_keeps_one_point(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, currency="CZK", fx_rate=None)

    client.post("/api/snapshots", headers=auth(token))
    client.post("/api/snapshots", headers=auth(token))

    assert len(client.get("/api/snapshots", headers=auth(token)).json()) == 1


# --- Quantitative layer ----------------------------------------------------


def test_holdings_can_be_turned_into_an_input_for_the_analysis_layer(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, currency="CZK", fx_rate=None, price=100.0)
    add_transaction(
        client, token, portfolio_id, ticker="MSFT", currency="CZK", fx_rate=None,
        price=100.0, quantity=10,
    )
    for key in ("AAPL|NASDAQ|CZK", "MSFT|NASDAQ|CZK"):
        client.put(
            "/api/prices/manual", headers=auth(token), json={"instrument_key": key, "price": 100.0}
        )

    derived = client.get("/api/portfolio/from-holdings", headers=auth(token)).json()

    assert set(derived["tickers"]) == {"AAPL", "MSFT"}
    assert sum(derived["weights"]) == pytest.approx(1.0)
    assert derived["weights"][derived["tickers"].index("AAPL")] == pytest.approx(2 / 3)


def test_positions_without_a_price_are_named_rather_than_silently_dropped(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id)

    derived = client.get("/api/portfolio/from-holdings", headers=auth(token)).json()

    assert derived["tickers"] == []
    assert derived["excluded"] == [{"ticker": "AAPL", "reason": "chybí aktuální cena"}]


# --- AI layer --------------------------------------------------------------


def test_the_ai_layer_reports_a_clean_error_when_data_is_unreachable(client):
    token = register(client)

    response = client.post("/api/ai/analyze", headers=auth(token), json={"ticker": "AAPL"})

    # Offline here; what matters is that it fails as a stated reason, not a 500.
    assert response.status_code in (200, 502)
    if response.status_code == 502:
        assert response.json()["detail"]


# --- YTD metrics -------------------------------------------------------


def test_ytd_gain_is_unavailable_without_a_snapshot_this_year(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, currency="CZK", fx_rate=None, price=100.0)

    overview = client.get("/api/overview", headers=auth(token)).json()

    assert overview["ytd_gain_czk"] is None
    assert overview["ytd_unavailable_reason"] is not None


def test_ytd_gain_is_computed_from_the_years_earliest_snapshot(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, currency="CZK", fx_rate=None, price=100.0, quantity=10)
    client.put(
        "/api/prices/manual",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 100.0},
    )
    # A snapshot taken today, at today's value, stands in for "start of year".
    client.post("/api/snapshots", headers=auth(token))

    # The price rises after the snapshot, with no new money added.
    client.put(
        "/api/prices/manual",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 120.0},
    )
    overview = client.get("/api/overview", headers=auth(token)).json()

    assert overview["ytd_gain_czk"] == pytest.approx(10 * 120.0 - 10 * 100.0)
    assert overview["ytd_gain_pct"] == pytest.approx(20.0)
    assert overview["ytd_basis_date"] is not None


def test_position_count_and_ytd_sales_appear_on_the_overview(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, currency="CZK", fx_rate=None, price=100.0, quantity=10)

    overview = client.get("/api/overview", headers=auth(token)).json()

    assert overview["position_count"] == 1
    assert overview["position_count_by_class"] == {"STOCK": 1}
    assert overview["ytd_sales_tax_exempt"] is None
    assert len(overview["allocation_by_instrument"]) == 0  # no price yet, so no value


# --- Segments ("Vlastní rozdělení") -----------------------------------------


def test_a_segment_can_be_created_renamed_and_deleted(client):
    token = register(client)

    created = client.post(
        "/api/segments", headers=auth(token), json={"name": "Jádro", "color": "#dcb45c"}
    )
    assert created.status_code == 201
    segment_id = created.json()["id"]
    assert created.json()["member_instrument_keys"] == []

    renamed = client.patch(
        f"/api/segments/{segment_id}", headers=auth(token), json={"name": "Jádro portfolia"}
    )
    assert renamed.json()["name"] == "Jádro portfolia"

    deleted = client.delete(f"/api/segments/{segment_id}", headers=auth(token))
    assert deleted.status_code == 204
    assert client.get("/api/segments", headers=auth(token)).json() == []


def test_two_segments_cannot_share_a_name(client):
    token = register(client)
    client.post("/api/segments", headers=auth(token), json={"name": "Jádro"})

    duplicate = client.post("/api/segments", headers=auth(token), json={"name": "Jádro"})

    assert duplicate.status_code == 409


def test_an_instrument_can_be_assigned_to_a_segment_and_then_unassigned(client):
    token = register(client)
    segment_id = client.post(
        "/api/segments", headers=auth(token), json={"name": "Spekulace"}
    ).json()["id"]

    assigned = client.put(
        "/api/segments/assign",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|USD", "segment_id": segment_id},
    )
    assert assigned.json() == {"instrument_key": "AAPL|NASDAQ|USD", "segment_id": segment_id}
    assert client.get("/api/segments", headers=auth(token)).json()[0]["member_instrument_keys"] == [
        "AAPL|NASDAQ|USD"
    ]

    unassigned = client.put(
        "/api/segments/assign",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|USD", "segment_id": None},
    )
    assert unassigned.json()["segment_id"] is None
    assert client.get("/api/segments", headers=auth(token)).json()[0]["member_instrument_keys"] == []


def test_segment_allocation_splits_value_and_puts_the_rest_in_unassigned(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, ticker="AAPL", currency="CZK", fx_rate=None, price=100.0, quantity=10)
    add_transaction(client, token, portfolio_id, ticker="MSFT", currency="CZK", fx_rate=None, price=50.0, quantity=10)
    client.put(
        "/api/prices/manual",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 100.0},
    )
    client.put(
        "/api/prices/manual",
        headers=auth(token),
        json={"instrument_key": "MSFT|NASDAQ|CZK", "price": 50.0},
    )

    segment_id = client.post(
        "/api/segments", headers=auth(token), json={"name": "Jádro", "color": "#123456"}
    ).json()["id"]
    client.put(
        "/api/segments/assign",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "segment_id": segment_id},
    )

    overview = client.get("/api/overview", headers=auth(token)).json()
    by_label = {s["label"]: s for s in overview["allocation_by_segment"]}

    assert by_label["Jádro"]["value_czk"] == pytest.approx(1000.0)
    assert by_label["Jádro"]["color"] == "#123456"
    assert by_label["Nezařazeno"]["value_czk"] == pytest.approx(500.0)


def test_a_segment_cannot_be_seen_or_assigned_by_another_account(client):
    mine = register(client, email="mine@example.com")
    theirs = register(client, email="theirs@example.com")
    segment_id = client.post("/api/segments", headers=auth(mine), json={"name": "Jádro"}).json()["id"]

    response = client.put(
        "/api/segments/assign",
        headers=auth(theirs),
        json={"instrument_key": "AAPL|NASDAQ|USD", "segment_id": segment_id},
    )

    assert response.status_code == 404


# --- Transaction journal -----------------------------------------------------


def test_the_transaction_journal_spans_portfolios_newest_first(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    second_id = client.post(
        "/api/portfolios", headers=auth(token), json={"name": "Druhé"}
    ).json()["id"]
    add_transaction(client, token, portfolio_id, ticker="AAPL", date="2021-01-10")
    add_transaction(client, token, second_id, ticker="MSFT", date="2022-06-01")

    journal = client.get("/api/transactions", headers=auth(token)).json()

    assert [row["ticker"] for row in journal] == ["MSFT", "AAPL"]
    assert journal[0]["portfolio_name"] == "Druhé"


def test_the_transaction_journal_can_be_narrowed_to_one_portfolio(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    second_id = client.post(
        "/api/portfolios", headers=auth(token), json={"name": "Druhé"}
    ).json()["id"]
    add_transaction(client, token, portfolio_id, ticker="AAPL")
    add_transaction(client, token, second_id, ticker="MSFT")

    journal = client.get(
        f"/api/transactions?portfolio_ids={portfolio_id}", headers=auth(token)
    ).json()

    assert [row["ticker"] for row in journal] == ["AAPL"]


def test_one_account_cannot_see_anothers_transaction_journal(client):
    mine = register(client, email="mine2@example.com")
    theirs = register(client, email="theirs2@example.com")
    portfolio_id = client.get("/api/portfolios", headers=auth(mine)).json()[0]["id"]
    add_transaction(client, mine, portfolio_id, ticker="AAPL")

    journal = client.get("/api/transactions", headers=auth(theirs)).json()

    assert journal == []


# --- Dividend income (trailing 12 months) and the forward calendar ---------


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
        "fee": 15.0,
        "fx_rate": None,
    }
    payload.update(overrides)
    return client.post(
        f"/api/portfolios/{portfolio_id}/transactions", headers=auth(token), json=payload
    )


def test_trailing_12m_dividend_yield_and_by_instrument(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(client, token, portfolio_id, ticker="AAPL", currency="CZK", fx_rate=None, price=100.0, quantity=10, fee=0.0)
    client.put(
        "/api/prices/manual",
        headers=auth(token),
        json={"instrument_key": "AAPL|NASDAQ|CZK", "price": 100.0},
    )
    add_dividend(client, token, portfolio_id, price=100.0, fee=15.0)

    overview = client.get("/api/overview", headers=auth(token)).json()

    assert overview["trailing_12m_dividends_czk"] == pytest.approx(85.0)
    assert len(overview["dividends_by_instrument"]) == 1
    assert overview["dividends_by_instrument"][0]["ticker"] == "AAPL"
    assert overview["dividends_by_instrument"][0]["value_czk"] == pytest.approx(85.0)
    # Value and cost basis both come to 1000 Kč here (10 shares at 100), so
    # yield and yield-on-cost coincide.
    assert overview["dividend_yield_pct"] == pytest.approx(8.5)
    assert overview["dividend_yield_on_cost_pct"] == pytest.approx(8.5)


def test_dividends_older_than_a_year_do_not_count_towards_the_yield(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(
        client, token, portfolio_id, ticker="AAPL", currency="CZK", fx_rate=None,
        price=100.0, quantity=10, date="2015-01-01",
    )
    old_date = (date.today() - timedelta(days=400)).isoformat()
    recent_date = (date.today() - timedelta(days=10)).isoformat()
    add_dividend(client, token, portfolio_id, date=old_date, price=999.0, fee=0.0)
    add_dividend(client, token, portfolio_id, date=recent_date, price=50.0, fee=0.0)

    overview = client.get("/api/overview", headers=auth(token)).json()

    assert overview["trailing_12m_dividends_czk"] == pytest.approx(50.0)


def test_upcoming_dividends_projects_several_payments_within_a_year(client):
    token = register(client)
    portfolio_id = client.get("/api/portfolios", headers=auth(token)).json()[0]["id"]
    add_transaction(
        client, token, portfolio_id, ticker="AAPL", currency="CZK", fx_rate=None,
        price=100.0, quantity=10, date="2015-01-01",
    )
    first = (date.today() - timedelta(days=180)).isoformat()
    second = (date.today() - timedelta(days=89)).isoformat()  # ~91-day cadence
    add_dividend(client, token, portfolio_id, date=first, price=50.0, fee=0.0)
    add_dividend(client, token, portfolio_id, date=second, price=50.0, fee=0.0)

    overview = client.get("/api/overview", headers=auth(token)).json()
    entries = [row for row in overview["upcoming_dividends"] if row["ticker"] == "AAPL"]

    assert len(entries) >= 3
    assert all(row["days_away"] <= 365 for row in entries)
    gaps = [entries[i + 1]["days_away"] - entries[i]["days_away"] for i in range(len(entries) - 1)]
    assert all(gap == gaps[0] for gap in gaps)
