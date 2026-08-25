"""FIFO lots, the four transaction types, and the invariants that must hold."""

from datetime import date

import pytest

from app.engine import fifo
from app.engine.fifo import TxInput


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


def dividend(day, gross, tax=0.0, currency="USD", fx=None, tx_id=None):
    return TxInput(
        id=tx_id, type="DIV", date=day, quantity=1, price=gross,
        currency=currency, fee=tax, fx_rate=fx,
    )


def split(day, ratio, tx_id=None):
    return TxInput(
        id=tx_id, type="ADJUST", date=day, quantity=ratio, price=0.0,
        currency="USD", fx_rate=1.0,
    )


# --- FIFO on a partial sale ------------------------------------------------


def test_partial_sale_consumes_the_oldest_lot_first():
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
        buy(date(2021, 6, 1), 10, 150.0, fx=22.0),
        sell(date(2023, 3, 1), 15, 200.0, fx=24.0),
    ])

    # The whole first lot went, plus half the second.
    assert len(result.lots) == 1
    assert result.lots[0].quantity == pytest.approx(5)
    assert result.lots[0].price == pytest.approx(150.0)
    assert result.lots[0].date == date(2021, 6, 1)


def test_partial_sale_realises_the_old_lots_cost_not_an_average():
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
        buy(date(2021, 6, 1), 10, 150.0, fx=22.0),
        sell(date(2023, 3, 1), 15, 200.0, fx=24.0),
    ])

    # 10 units against the 100 lot, then 5 against the 150 lot.
    expected = (10 * 200 * 24 - 10 * 100 * 23) + (5 * 200 * 24 - 5 * 150 * 22)
    assert result.realized_gain_czk == pytest.approx(expected)

    # An averaged cost basis would have produced a different, wrong number.
    averaged = 15 * 200 * 24 - 15 * 125 * 22.5
    assert result.realized_gain_czk != pytest.approx(averaged)


def test_sale_carries_the_originating_lot_date_for_the_holding_period():
    result = fifo.run([
        buy(date(2019, 1, 10), 5, 100.0, fx=23.0),
        buy(date(2023, 1, 10), 5, 100.0, fx=23.0),
        sell(date(2024, 1, 10), 5, 120.0, fx=23.0),
    ])

    assert result.sales[0].lot_date == date(2019, 1, 10)
    assert result.sales[0].held_days == (date(2024, 1, 10) - date(2019, 1, 10)).days


def test_purchase_fee_is_split_across_a_partial_sale():
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 100.0, fx=1.0, fee=50.0),
        sell(date(2021, 1, 10), 4, 100.0, fx=1.0),
    ])

    # Two fifths of the fee left with the sold shares.
    assert result.sales[0].cost_czk == pytest.approx(4 * 100 + 20.0)
    assert result.lots[0].fee_czk == pytest.approx(30.0)


def test_selling_more_than_held_is_refused():
    with pytest.raises(fifo.InsufficientHoldingsError) as excinfo:
        fifo.run([
            buy(date(2020, 1, 10), 10, 100.0, fx=1.0),
            sell(date(2021, 1, 10), 15, 120.0, fx=1.0),
        ])

    assert excinfo.value.available == pytest.approx(10)
    assert excinfo.value.requested == pytest.approx(15)


def test_fully_closed_position_leaves_no_phantom_fraction():
    result = fifo.run([
        buy(date(2020, 1, 10), 3, 100.0, fx=1.0),
        sell(date(2021, 1, 10), 3, 120.0, fx=1.0),
    ])

    assert result.lots == []
    assert result.quantity == pytest.approx(0)


# --- Negative fee ----------------------------------------------------------


def test_negative_fee_reduces_the_cost_basis():
    """An assigned short put: the real cost is the strike less the premium."""
    assigned = fifo.run([buy(date(2020, 1, 10), 100, 50.0, fx=1.0, fee=-200.0)])
    plain = fifo.run([buy(date(2020, 1, 10), 100, 50.0, fx=1.0, fee=0.0)])

    assert assigned.open_cost_czk == pytest.approx(4_800.0)
    assert assigned.open_cost_czk < plain.open_cost_czk


# --- ADJUST (splits) -------------------------------------------------------


def test_split_multiplies_shares_and_divides_price():
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 400.0, fx=23.0),
        split(date(2021, 8, 31), 4),
    ])

    assert result.quantity == pytest.approx(40)
    assert result.lots[0].price == pytest.approx(100.0)


def test_split_leaves_the_total_cost_basis_untouched():
    """A split hands out no money and costs none."""
    before = fifo.run([buy(date(2020, 1, 10), 10, 400.0, fx=23.0, fee=100.0)])
    after = fifo.run([
        buy(date(2020, 1, 10), 10, 400.0, fx=23.0, fee=100.0),
        split(date(2021, 8, 31), 4),
    ])

    assert after.open_cost_czk == pytest.approx(before.open_cost_czk)


def test_reverse_split_leaves_the_total_cost_basis_untouched():
    before = fifo.run([buy(date(2020, 1, 10), 100, 5.0, fx=23.0)])
    after = fifo.run([
        buy(date(2020, 1, 10), 100, 5.0, fx=23.0),
        split(date(2021, 8, 31), 0.25),
    ])

    assert after.quantity == pytest.approx(25)
    assert after.lots[0].price == pytest.approx(20.0)
    assert after.open_cost_czk == pytest.approx(before.open_cost_czk)


def test_split_keeps_each_lot_separate():
    result = fifo.run([
        buy(date(2019, 1, 10), 10, 400.0, fx=23.0),
        buy(date(2020, 1, 10), 5, 500.0, fx=23.0),
        split(date(2021, 8, 31), 4),
    ])

    assert [lot.quantity for lot in result.lots] == pytest.approx([40, 20])
    assert [lot.price for lot in result.lots] == pytest.approx([100.0, 125.0])
    assert [lot.date for lot in result.lots] == [date(2019, 1, 10), date(2020, 1, 10)]


def test_sale_after_a_split_prices_against_the_adjusted_lot():
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 400.0, fx=1.0),
        split(date(2021, 8, 31), 4),
        sell(date(2022, 1, 10), 20, 120.0, fx=1.0),
    ])

    # 20 shares at an adjusted basis of 100 each.
    assert result.realized_gain_czk == pytest.approx(20 * 120 - 20 * 100)


def test_split_of_one_changes_nothing_and_says_so():
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 400.0, fx=1.0),
        split(date(2021, 8, 31), 1),
    ])

    assert result.quantity == pytest.approx(10)
    assert result.splits == []
    assert any("nic nemění" in warning for warning in result.warnings)


def test_split_applies_before_a_same_day_sale_is_measured():
    """A same-day sale is measured against the post-split share count."""
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 400.0, fx=1.0),
        split(date(2021, 8, 31), 4),
        sell(date(2021, 8, 31), 40, 110.0, fx=1.0),
    ])

    assert result.quantity == pytest.approx(0)
    assert result.realized_gain_czk == pytest.approx(40 * 110 - 40 * 100)


# --- Dividends -------------------------------------------------------------


def test_dividend_records_gross_tax_and_net():
    result = fifo.run([
        buy(date(2020, 1, 10), 100, 50.0, fx=23.0),
        dividend(date(2021, 3, 1), gross=120.0, tax=18.0, fx=22.0),
    ])

    assert result.gross_dividends_czk == pytest.approx(120 * 22)
    assert result.net_dividends_czk == pytest.approx((120 - 18) * 22)


def test_dividend_does_not_touch_share_count_or_cost():
    without = fifo.run([buy(date(2020, 1, 10), 100, 50.0, fx=23.0)])
    with_div = fifo.run([
        buy(date(2020, 1, 10), 100, 50.0, fx=23.0),
        dividend(date(2021, 3, 1), gross=120.0, tax=18.0, fx=22.0),
    ])

    assert with_div.quantity == pytest.approx(without.quantity)
    assert with_div.open_cost_czk == pytest.approx(without.open_cost_czk)


# --- Fractional quantities -------------------------------------------------


def test_crypto_quantities_survive_to_eight_decimals():
    result = fifo.run([
        buy(date(2021, 1, 10), 0.00385000, 40_000.0, currency="USD", fx=21.5),
        buy(date(2021, 6, 10), 0.01230000, 35_000.0, currency="USD", fx=21.0),
        sell(date(2023, 1, 10), 0.00500000, 22_000.0, currency="USD", fx=22.0),
    ])

    assert result.quantity == pytest.approx(0.01115, abs=1e-9)


# --- Missing FX ------------------------------------------------------------


def test_a_buy_without_a_rate_is_flagged_rather_than_guessed():
    result = fifo.run([buy(date(2020, 1, 10), 10, 100.0, currency="USD", fx=None, tx_id=7)])

    assert result.missing_fx_transaction_ids == [7]
    assert result.lots[0].gross_cost_czk() is None


def test_czk_trades_need_no_rate_at_all():
    result = fifo.run([buy(date(2020, 1, 10), 10, 250.0, currency="CZK", tx_id=7)])

    assert result.missing_fx_transaction_ids == []
    assert result.open_cost_czk == pytest.approx(2_500.0)


# --- Sale without a known rate --------------------------------------------


def test_a_sale_without_a_rate_books_no_result_rather_than_a_fake_loss():
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
        sell(date(2021, 1, 10), 4, 120.0, fx=None, tx_id=9),
    ])

    # Valuing the proceeds at a rate of zero would book the whole cost basis as
    # a loss, which looks like a real number and would reach the portfolio total.
    assert result.sales == []
    assert result.realized_gain_czk == pytest.approx(0.0)
    assert result.missing_fx_transaction_ids == [9]


def test_a_sale_without_a_rate_still_reduces_the_holding():
    result = fifo.run([
        buy(date(2020, 1, 10), 10, 100.0, fx=23.0),
        sell(date(2021, 1, 10), 4, 120.0, fx=None, tx_id=9),
    ])

    assert result.quantity == pytest.approx(6)
