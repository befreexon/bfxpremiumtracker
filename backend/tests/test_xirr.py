"""XIRR against known references."""

from datetime import date

import pytest

from app.engine.xirr import CashFlow, xirr


def test_a_single_year_at_ten_percent():
    result = xirr([
        CashFlow(date(2021, 1, 1), -1000.0),
        CashFlow(date(2022, 1, 1), 1100.0),
    ])

    assert result == pytest.approx(0.10, abs=1e-6)


def test_reference_example_from_the_spreadsheet_function():
    """The documented XIRR worked example, which returns 37.34 %."""
    result = xirr([
        CashFlow(date(2008, 1, 1), -10_000.0),
        CashFlow(date(2008, 3, 1), 2_750.0),
        CashFlow(date(2008, 10, 30), 4_250.0),
        CashFlow(date(2009, 2, 15), 3_250.0),
        CashFlow(date(2009, 4, 1), 2_750.0),
    ])

    assert result == pytest.approx(0.373362535, abs=1e-6)


def test_doubling_over_two_years_is_not_fifty_percent_a_year():
    start, end = date(2020, 1, 1), date(2022, 1, 1)

    result = xirr([CashFlow(start, -1000.0), CashFlow(end, 2000.0)])

    # Compounding, not division: the rate that doubles the money over the span.
    # 2020 was a leap year, so the span is 731 days rather than 730.
    expected = 2 ** (365 / (end - start).days) - 1
    assert result == pytest.approx(expected, abs=1e-9)
    assert result < 0.42


def test_a_loss_returns_a_negative_rate():
    result = xirr([
        CashFlow(date(2021, 1, 1), -1000.0),
        CashFlow(date(2022, 1, 1), 800.0),
    ])

    assert result == pytest.approx(-0.20, abs=1e-6)


def test_regular_contributions_are_weighted_by_when_they_arrived():
    """Money that arrived late had less time to work, and XIRR knows it."""
    late_money = xirr([
        CashFlow(date(2021, 1, 1), -1000.0),
        CashFlow(date(2021, 12, 1), -1000.0),
        CashFlow(date(2022, 1, 1), 2200.0),
    ])
    early_money = xirr([
        CashFlow(date(2021, 1, 1), -1000.0),
        CashFlow(date(2021, 2, 1), -1000.0),
        CashFlow(date(2022, 1, 1), 2200.0),
    ])

    assert late_money > early_money


def test_flows_in_one_direction_only_have_no_rate():
    assert xirr([
        CashFlow(date(2021, 1, 1), -1000.0),
        CashFlow(date(2022, 1, 1), -500.0),
    ]) is None


def test_a_single_flow_has_no_rate():
    assert xirr([CashFlow(date(2021, 1, 1), -1000.0)]) is None


def test_failure_is_none_rather_than_zero():
    """A zero would read as 'you broke even', which is a different claim."""
    assert xirr([]) is None


def test_unordered_flows_are_handled():
    ordered = xirr([
        CashFlow(date(2021, 1, 1), -1000.0),
        CashFlow(date(2022, 1, 1), 1100.0),
    ])
    shuffled = xirr([
        CashFlow(date(2022, 1, 1), 1100.0),
        CashFlow(date(2021, 1, 1), -1000.0),
    ])

    assert ordered == pytest.approx(shuffled)


def test_a_near_total_loss_still_converges():
    result = xirr([
        CashFlow(date(2021, 1, 1), -10_000.0),
        CashFlow(date(2022, 1, 1), 100.0),
    ])

    assert result is not None
    assert result < -0.9
