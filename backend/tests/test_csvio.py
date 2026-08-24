"""CSV import validation and the round trip through export."""

from datetime import date
from pathlib import Path

import pytest

from app.models import Transaction
from app.services import csvio

TODAY = date(2026, 8, 24)
HEADER = ",".join(csvio.COLUMNS)
SAMPLE_FILE = Path(__file__).resolve().parent.parent / "app" / "static" / "import-vzor.csv"


def make_csv(*rows: str, header: str = HEADER) -> str:
    return "\n".join([header, *rows]) + "\n"


def preview(db, user, portfolio, text):
    return csvio.preview_import(db, user, text, default_portfolio=portfolio, today=TODAY)


# --- Structure -------------------------------------------------------------


def test_a_missing_required_column_stops_the_whole_import(db, user, portfolio):
    text = make_csv(
        "BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.50",
        header="typ,datum,ticker,burza,trida,mnozstvi,cena",
    )

    result = preview(db, user, portfolio, text)

    assert result.fatal_error is not None
    assert "mena" in result.fatal_error
    assert result.rows == []


def test_semicolons_and_decimal_commas_from_czech_excel_are_read(db, user, portfolio):
    text = (
        ";".join(csvio.COLUMNS) + "\n"
        + "BUY;2024-01-15;AAPL;NASDAQ;STOCK;10;185,50;USD;8,5;23,10;;;;\n"
    )

    result = preview(db, user, portfolio, text)

    assert result.delimiter == ";"
    assert result.rows[0].data["price"] == pytest.approx(185.50)
    assert result.rows[0].data["fee"] == pytest.approx(8.5)


def test_a_byte_order_mark_does_not_break_the_header(db, user, portfolio):
    text = "﻿" + make_csv("BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.50,USD,,,,,,")

    result = preview(db, user, portfolio, text)

    assert result.fatal_error is None
    assert result.rows[0].status == csvio.STATUS_OK


# --- Row validation --------------------------------------------------------


def test_an_unknown_transaction_type_is_rejected(db, user, portfolio):
    result = preview(db, user, portfolio, make_csv("SPLIT,2024-01-15,AAPL,NASDAQ,STOCK,10,1,USD,,,,,,"))

    assert result.rows[0].status == csvio.STATUS_ERROR
    assert "BUY" in result.rows[0].messages[0]


def test_an_unreadable_date_is_rejected(db, user, portfolio):
    result = preview(db, user, portfolio, make_csv("BUY,15 ledna,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,"))

    assert result.rows[0].status == csvio.STATUS_ERROR


def test_a_date_in_the_future_is_rejected(db, user, portfolio):
    result = preview(db, user, portfolio, make_csv("BUY,2030-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,"))

    assert result.rows[0].status == csvio.STATUS_ERROR
    assert "budoucnosti" in result.rows[0].messages[0]


@pytest.mark.parametrize("quantity,price", [("0", "185.5"), ("-5", "185.5"), ("10", "0"), ("10", "-3")])
def test_non_positive_quantity_or_price_is_rejected(db, user, portfolio, quantity, price):
    result = preview(
        db, user, portfolio,
        make_csv(f"BUY,2024-01-15,AAPL,NASDAQ,STOCK,{quantity},{price},USD,,,,,,"),
    )

    assert result.rows[0].status == csvio.STATUS_ERROR


def test_selling_more_than_held_is_rejected_and_says_what_was_available(db, user, portfolio):
    result = preview(
        db, user, portfolio,
        make_csv(
            "BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,",
            "SELL,2024-06-01,AAPL,NASDAQ,STOCK,15,210,USD,,,,,,",
        ),
    )

    assert result.rows[1].status == csvio.STATUS_ERROR
    assert "10" in result.rows[1].messages[0]


def test_a_sale_within_the_holding_is_accepted(db, user, portfolio):
    result = preview(
        db, user, portfolio,
        make_csv(
            "BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,",
            "SELL,2024-06-01,AAPL,NASDAQ,STOCK,4,210,USD,,,,,,",
        ),
    )

    assert [row.status for row in result.rows] == [csvio.STATUS_OK, csvio.STATUS_OK]


def test_a_split_of_one_is_flagged_as_pointless_but_still_imports(db, user, portfolio):
    result = preview(
        db, user, portfolio,
        make_csv(
            "BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,",
            "ADJUST,2024-06-01,AAPL,NASDAQ,STOCK,1,0,USD,,,,,,",
        ),
    )

    assert result.rows[1].status == csvio.STATUS_WARNING
    assert "nic nemění" in result.rows[1].messages[0]


def test_a_split_carries_a_ratio_not_a_share_count(db, user, portfolio):
    result = preview(
        db, user, portfolio,
        make_csv(
            "BUY,2020-08-10,NVDA,NASDAQ,STOCK,8,52,USD,,22.1,,,,",
            "ADJUST,2021-07-20,NVDA,NASDAQ,STOCK,4,0,USD,,,,,,",
        ),
    )

    # Price of zero is fine on a split, which is why it is exempt from the check.
    assert result.rows[1].status == csvio.STATUS_OK
    assert result.rows[1].data["quantity"] == pytest.approx(4)


def test_a_negative_fee_is_accepted_because_it_lowers_the_basis(db, user, portfolio):
    result = preview(
        db, user, portfolio,
        make_csv("BUY,2023-02-14,MSFT,NASDAQ,STOCK,100,250,USD,-1850,22.3,,,,"),
    )

    assert result.rows[0].status == csvio.STATUS_OK
    assert result.rows[0].data["fee"] == pytest.approx(-1850.0)


def test_a_dividend_with_a_share_count_instead_of_one_is_flagged(db, user, portfolio):
    result = preview(
        db, user, portfolio,
        make_csv("DIV,2024-05-10,AAPL,NASDAQ,STOCK,10,2.40,USD,0.36,23.1,,,,"),
    )

    assert result.rows[0].status == csvio.STATUS_WARNING
    assert "množství 1" in result.rows[0].messages[0]


# --- Duplicates ------------------------------------------------------------


def test_a_row_repeated_inside_the_file_is_skipped(db, user, portfolio):
    line = "BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,"

    result = preview(db, user, portfolio, make_csv(line, line))

    assert result.rows[0].status == csvio.STATUS_OK
    assert result.rows[1].status == csvio.STATUS_DUPLICATE


def test_a_row_already_in_the_database_is_skipped(db, user, portfolio):
    db.add(Transaction(
        portfolio_id=portfolio.id, type="BUY", date=date(2024, 1, 15), ticker="AAPL",
        exchange="NASDAQ", asset_class="STOCK", currency="USD", quantity=10, price=185.5,
    ))
    db.commit()

    result = preview(
        db, user, portfolio, make_csv("BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,")
    )

    assert result.rows[0].status == csvio.STATUS_DUPLICATE


# --- Portfolios ------------------------------------------------------------


def test_an_unknown_portfolio_is_announced_and_then_created(db, user, portfolio):
    result = preview(
        db, user, portfolio,
        make_csv("BUY,2024-01-15,BTC,CRYPTO,CRYPTO,0.05,42000,USD,,23.1,,,Krypto,"),
    )
    assert result.new_portfolios == ["Krypto"]

    outcome = csvio.commit_import(db, user, result, portfolio)

    assert outcome["created_portfolios"] == ["Krypto"]
    assert outcome["imported"] == 1


def test_a_blank_portfolio_column_falls_back_to_the_active_one(db, user, portfolio):
    result = preview(db, user, portfolio, make_csv("BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,"))

    csvio.commit_import(db, user, result, portfolio)

    assert db.query(Transaction).one().portfolio_id == portfolio.id


# --- Commit ----------------------------------------------------------------


def test_bad_rows_are_left_out_and_the_rest_still_imports(db, user, portfolio):
    result = preview(
        db, user, portfolio,
        make_csv(
            "BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,",
            "BUY,2030-01-15,MSFT,NASDAQ,STOCK,5,300,USD,,,,,,",
            "BUY,2024-02-20,VWCE,XETRA,ETF,25,112.3,EUR,,25.1,,,,",
        ),
    )

    outcome = csvio.commit_import(db, user, result, portfolio)

    assert outcome["imported"] == 2
    assert {t.ticker for t in db.query(Transaction)} == {"AAPL", "VWCE"}


def test_nothing_is_written_when_the_header_was_rejected(db, user, portfolio):
    result = preview(db, user, portfolio, make_csv("BUY,2024-01-15,AAPL", header="typ,datum,ticker"))

    outcome = csvio.commit_import(db, user, result, portfolio)

    assert outcome["imported"] == 0
    assert db.query(Transaction).count() == 0


# --- The sample file -------------------------------------------------------


def test_the_shipped_sample_file_imports_cleanly(db, user, portfolio):
    result = preview(db, user, portfolio, SAMPLE_FILE.read_text(encoding="utf-8"))

    assert result.fatal_error is None
    assert result.counts[csvio.STATUS_ERROR] == 0
    assert len(result.importable) == 13


def test_the_sample_file_carries_every_awkward_case(db, user, portfolio):
    result = preview(db, user, portfolio, SAMPLE_FILE.read_text(encoding="utf-8"))
    rows = [row.data for row in result.importable]

    assert any(r["currency"] == "GBX" for r in rows), "pence-quoted line"
    assert any(r["type"] == "ADJUST" for r in rows), "split"
    assert any(r["type"] == "DIV" for r in rows), "dividend"
    assert any(r["type"] == "SELL" for r in rows), "partial sale"
    assert any(r["fee"] < 0 for r in rows), "negative fee"
    assert any(r["quantity"] < 1 for r in rows), "fractional crypto"
    assert any(r["currency"] == "CZK" and r["fx_rate"] is None for r in rows), "no rate needed"
    assert len({r["portfolio_name"] for r in rows}) == 2, "two portfolios"


def test_the_sample_file_survives_a_round_trip_through_export(db, user, portfolio):
    first = preview(db, user, portfolio, SAMPLE_FILE.read_text(encoding="utf-8"))
    csvio.commit_import(db, user, first, portfolio)
    imported = db.query(Transaction).count()

    exported = csvio.export_csv(db, user)
    second = preview(db, user, portfolio, exported)

    # Everything re-reads, and everything is recognised as already present.
    assert second.fatal_error is None
    assert second.counts[csvio.STATUS_DUPLICATE] == imported


def test_export_writes_the_documented_column_order(db, user, portfolio):
    result = preview(db, user, portfolio, make_csv("BUY,2024-01-15,AAPL,NASDAQ,STOCK,10,185.5,USD,,,,,,"))
    csvio.commit_import(db, user, result, portfolio)

    exported = csvio.export_csv(db, user)

    assert exported.splitlines()[0] == HEADER
