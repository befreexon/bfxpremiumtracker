"""Position-level numbers: the price/currency split, the holding-period test,
and the two percentages that must never be confused."""

from datetime import date, timedelta

import pytest

from app.engine.fifo import TxInput
from app.engine.positions import build_portfolio, build_position


def buy(day, qty, price, currency="USD", fee=0.0, fx=None, tx_id=None):
    return TxInput(
        id=tx_id, type="BUY", date=day, quantity=qty, price=price,
        currency=currency, fee=fee, fx_rate=fx,
    )


def sell(day, qty, price, currency="USD", fee=0.0, fx=None, tx_id=None):
    return TxInput(
        id=tx_id, type="SELL", date=day, quantity=qty, price=price,
        currency=currency, fee=fee, fx_rate=fx,
    )


def dividend(day, gross, tax=0.0, currency="USD", fx=None):
    return TxInput(
        id=None, type="DIV", date=day, quantity=1, price=gross,
        currency=currency, fee=tax, fx_rate=fx,
    )


def position(transactions, price, fx, **kwargs):
    return build_position(
        ticker=kwargs.pop("ticker", "AAPL"),
        exchange=kwargs.pop("exchange", "NASDAQ"),
        currency=kwargs.pop("currency", "USD"),
        asset_class=kwargs.pop("asset_class", "STOCK"),
        transactions=transactions,
        current_price=price,
        current_fx=fx,
        today=kwargs.pop("today", date(2024, 1, 10)),
        **kwargs,
    )


# --- Price effect plus currency effect equals the gross gain ---------------


def test_the_two_effects_add_up_to_the_gross_gain():
    view = position([buy(date(2020, 1, 10), 10, 100.0, fx=23.0)], price=150.0, fx=25.0)

    gross_gain = view.value_czk - (view.cost_czk - 0.0)
    assert view.price_effect_czk + view.fx_effect_czk == pytest.approx(gross_gain)


def test_the_two_effects_add_up_across_lots_bought_at_different_rates():
    view = position(
        [
            buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
            buy(date(2021, 6, 1), 5, 120.0, fx=21.5),
        ],
        price=150.0,
        fx=25.0,
    )

    gross_cost = 10 * 100 * 23.0 + 5 * 120 * 21.5
    assert view.price_effect_czk + view.fx_effect_czk == pytest.approx(
        view.value_czk - gross_cost
    )


def test_the_two_effects_still_reconcile_after_a_partial_sale():
    view = position(
        [
            buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
            buy(date(2021, 6, 1), 10, 120.0, fx=21.5),
            sell(date(2022, 6, 1), 12, 140.0, fx=24.0),
        ],
        price=150.0,
        fx=25.0,
    )

    remaining_gross_cost = 8 * 120 * 21.5
    assert view.price_effect_czk + view.fx_effect_czk == pytest.approx(
        view.value_czk - remaining_gross_cost
    )


def test_a_currency_move_alone_produces_a_gain_with_no_price_move():
    view = position([buy(date(2020, 1, 10), 10, 100.0, fx=20.0)], price=100.0, fx=25.0)

    assert view.price_effect_czk == pytest.approx(0.0)
    assert view.fx_effect_czk == pytest.approx(10 * 100 * 5.0)


def test_a_czk_position_has_no_currency_effect():
    view = position(
        [buy(date(2020, 1, 10), 10, 250.0, currency="CZK")],
        price=300.0,
        fx=None,
        currency="CZK",
    )

    assert view.fx_effect_czk == pytest.approx(0.0)
    assert view.price_effect_czk == pytest.approx(10 * 50.0)


# --- The two percentages ---------------------------------------------------


def test_price_move_ignores_currency_and_dividends():
    view = position(
        [
            buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
            dividend(date(2021, 3, 1), gross=50.0, tax=7.5, fx=22.0),
        ],
        price=120.0,
        fx=30.0,
    )

    assert view.price_move_pct == pytest.approx(20.0)


def test_total_gain_includes_currency_dividends_and_realised_results():
    view = position(
        [
            buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
            dividend(date(2021, 3, 1), gross=50.0, tax=7.5, fx=22.0),
        ],
        price=120.0,
        fx=30.0,
    )

    expected = (10 * 120 * 30.0 - 10 * 100 * 23.0) + (50 - 7.5) * 22.0
    assert view.total_gain_czk == pytest.approx(expected)
    assert view.total_gain_pct > view.price_move_pct


def test_a_position_can_gain_in_czk_while_the_price_falls():
    """The case a Czech investor in US equities actually meets."""
    view = position([buy(date(2020, 1, 10), 10, 100.0, fx=20.0)], price=95.0, fx=25.0)

    assert view.price_move_pct < 0
    assert view.total_gain_czk > 0


def test_the_return_denominator_survives_a_full_exit():
    view = position(
        [
            buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
            sell(date(2022, 1, 10), 10, 150.0, fx=23.0),
        ],
        price=None,
        fx=23.0,
    )

    assert view.quantity == pytest.approx(0)
    assert view.total_gain_czk == pytest.approx(10 * 150 * 23 - 10 * 100 * 23)
    assert view.total_gain_pct == pytest.approx(50.0)


# --- Holding-period test ---------------------------------------------------


def test_a_lot_past_three_years_has_passed_the_test():
    view = position(
        [buy(date(2020, 1, 10), 10, 100.0, fx=23.0)],
        price=150.0, fx=25.0, today=date(2024, 1, 10),
    )

    assert view.lots[0].tax_test_status == "passed"
    assert view.lots[0].tax_test_days_remaining <= 0


@pytest.mark.parametrize(
    ("days_out", "expected"),
    [(30, "soon"), (200, "approaching"), (900, "far")],
)
def test_the_countdown_colours_by_how_close_the_lot_is(days_out, expected):
    today = date(2024, 1, 10)
    purchase = today + timedelta(days=days_out) - timedelta(days=365 * 3 + 1)

    view = position([buy(purchase, 10, 100.0, fx=23.0)], price=150.0, fx=25.0, today=today)

    assert view.lots[0].tax_test_status == expected


def test_each_lot_counts_down_on_its_own():
    view = position(
        [
            buy(date(2019, 1, 10), 10, 100.0, fx=23.0),
            buy(date(2023, 1, 10), 10, 120.0, fx=23.0),
        ],
        price=150.0, fx=25.0, today=date(2024, 1, 10),
    )

    assert view.lots[0].tax_test_status == "passed"
    assert view.lots[1].tax_test_status != "passed"


def test_the_holding_period_length_is_configurable():
    view = position(
        [buy(date(2020, 1, 10), 10, 100.0, fx=23.0)],
        price=150.0, fx=25.0, today=date(2024, 1, 10), tax_test_years=5,
    )

    assert view.lots[0].tax_test_status != "passed"


def test_a_leap_day_purchase_matures_on_the_first_of_march():
    view = position(
        [buy(date(2020, 2, 29), 10, 100.0, fx=23.0)],
        price=150.0, fx=25.0, today=date(2023, 3, 1),
    )

    assert view.lots[0].tax_test_days_remaining == 0
    assert view.lots[0].tax_test_status == "passed"


# --- Missing data ----------------------------------------------------------


def test_a_missing_price_is_flagged_rather_than_filled_in():
    view = position([buy(date(2020, 1, 10), 10, 100.0, fx=23.0)], price=None, fx=25.0)

    assert view.missing_price
    assert view.value_czk is None
    assert view.total_gain_czk is None


# --- Portfolio level -------------------------------------------------------


def test_portfolio_totals_add_up_across_positions():
    first = position([buy(date(2020, 1, 10), 10, 100.0, fx=23.0)], price=150.0, fx=25.0)
    second = position(
        [buy(date(2021, 1, 10), 5, 200.0, fx=22.0)],
        price=250.0, fx=25.0, ticker="MSFT",
    )

    view = build_portfolio([first, second], today=date(2024, 1, 10))

    assert view.value_czk == pytest.approx(first.value_czk + second.value_czk)
    assert view.total_gain_czk == pytest.approx(
        first.total_gain_czk + second.total_gain_czk
    )


def test_portfolio_gain_reconciles_with_value_and_flows():
    view = build_portfolio(
        [
            position(
                [
                    buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
                    sell(date(2022, 1, 10), 4, 150.0, fx=24.0),
                    dividend(date(2021, 3, 1), gross=50.0, tax=7.5, fx=22.0),
                ],
                price=170.0, fx=25.0,
            )
        ],
        today=date(2024, 1, 10),
    )

    assert view.total_gain_czk == pytest.approx(
        view.value_czk + view.withdrawn_czk - view.invested_czk
    )


def test_weights_and_the_concentration_warning():
    big = position([buy(date(2020, 1, 10), 100, 100.0, fx=25.0)], price=100.0, fx=25.0)
    small = position(
        [buy(date(2020, 1, 10), 10, 100.0, fx=25.0)],
        price=100.0, fx=25.0, ticker="MSFT",
    )

    view = build_portfolio([big, small], today=date(2024, 1, 10))

    assert big.weight == pytest.approx(100 / 110)
    assert [w["ticker"] for w in view.concentration_warnings] == ["AAPL"]


def test_allocation_splits_by_class_and_by_currency():
    stock = position([buy(date(2020, 1, 10), 10, 100.0, fx=25.0)], price=100.0, fx=25.0)
    etf = position(
        [buy(date(2020, 1, 10), 10, 100.0, currency="EUR", fx=25.0)],
        price=100.0, fx=25.0, ticker="VWCE", currency="EUR", asset_class="ETF",
    )

    view = build_portfolio([stock, etf], today=date(2024, 1, 10))

    assert {slice.label for slice in view.allocation_by_class} == {"STOCK", "ETF"}
    assert {slice.label for slice in view.allocation_by_currency} == {"USD", "EUR"}
    assert sum(slice.weight for slice in view.allocation_by_class) == pytest.approx(1.0)
