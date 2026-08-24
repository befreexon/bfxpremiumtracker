"""Minor-unit currencies. Getting GBX wrong overstates a position 100x."""

import pytest

from app.engine.currency import (
    interpret_user_fx,
    is_minor_unit,
    major_currency,
    minor_factor,
    quoted_rate_from_major,
    to_czk,
    to_major,
)


def test_gbx_is_its_own_currency_not_an_alias_for_gbp():
    assert is_minor_unit("GBX")
    assert major_currency("GBX") == "GBP"
    assert minor_factor("GBX") == 0.01
    assert not is_minor_unit("GBP")


def test_pence_convert_to_pounds():
    assert to_major(1500.0, "GBX") == (15.0, "GBP")


@pytest.mark.parametrize(
    ("code", "expected_major"),
    [("GBX", "GBP"), ("ZAC", "ZAR"), ("ILA", "ILS"), ("USD", "USD"), ("CZK", "CZK")],
)
def test_major_currency_mapping(code, expected_major):
    assert major_currency(code) == expected_major


def test_wizz_position_in_pence_is_not_a_hundred_times_too_big():
    # 200 shares of a LSE listing quoted at 1 500 GBX, pound at 28.50 CZK.
    # The position is worth 200 * 15 GBP * 28.50 = 85 500 CZK.
    quantity, quote_gbx, gbp_czk = 200, 1500.0, 28.50
    rate = quoted_rate_from_major(gbp_czk, "GBX")

    value = to_czk(quantity * quote_gbx, "GBX", rate)

    assert value == pytest.approx(85_500.0)
    # The mistake this guards against:
    assert to_czk(quantity * quote_gbx, "GBP", gbp_czk) == pytest.approx(8_550_000.0)


def test_czk_needs_no_rate():
    assert to_czk(1234.5, "CZK", None) == 1234.5


def test_missing_rate_yields_none_never_zero():
    # A zero here would silently read as "this position is worthless".
    assert to_czk(100.0, "USD", None) is None


def test_user_entering_the_pound_rate_for_a_pence_position_is_corrected():
    result = interpret_user_fx(28.50, "GBX", major_reference=28.50)

    assert result.corrected
    assert result.rate == pytest.approx(0.285)
    assert "GBX" in result.message


def test_correctly_entered_pence_rate_is_left_alone():
    result = interpret_user_fx(0.285, "GBX", major_reference=28.50)

    assert not result.corrected
    assert result.rate == pytest.approx(0.285)


def test_major_currency_rate_is_never_second_guessed():
    result = interpret_user_fx(23.10, "USD", major_reference=23.10)

    assert not result.corrected
    assert result.rate == 23.10
