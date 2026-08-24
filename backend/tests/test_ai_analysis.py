"""The AI-analysis layer's maths, exercised offline with synthetic price data.

Nothing here touches the network. Every test feeds a hand-built DataFrame or a
plain dict into one of the pure functions, which is exactly how the module is
laid out so that this is possible.
"""

import json
import math
from datetime import date

import pandas as pd
import pytest

from app.services.ai_analysis import (
    AnalystConsensus,
    Fundamentals,
    Narrative,
    TickerAnalysis,
    annualised_volatility,
    build_assessment,
    build_consensus,
    build_fundamentals,
    build_quote,
    close_series,
    compute_rsi,
    compute_sma,
    compute_technicals,
    detect_cross_state,
    downsample_history,
    max_drawdown_pct,
    momentum_score_from_returns,
    normalise_dividend_yield,
    project_prices,
    resolve_symbol,
    score_consensus,
    score_momentum,
    score_quality,
    score_valuation,
    to_dict,
    trailing_return_pct,
    verdict_for_score,
)


# --------------------------------------------------------------------------- #
# Fixtures / builders
# --------------------------------------------------------------------------- #


def frame(closes: list[float], start: date = date(2022, 1, 3)) -> pd.DataFrame:
    """A minimal yfinance-shaped history: business-day index, Close column."""
    index = pd.bdate_range(start=start, periods=len(closes))
    return pd.DataFrame({"Close": closes}, index=index)


def series(closes: list[float]) -> pd.Series:
    return close_series(frame(closes))


def rising(count: int, start: float = 100.0, step: float = 0.5) -> list[float]:
    return [start + step * i for i in range(count)]


def full_fundamentals() -> Fundamentals:
    return Fundamentals(
        market_cap=1.2e11,
        trailing_pe=18.0,
        forward_pe=15.0,
        peg=1.4,
        price_to_book=3.0,
        ev_to_ebitda=12.0,
        profit_margin=0.18,
        roe=0.22,
        revenue_growth=0.09,
        earnings_growth=0.12,
        debt_to_equity=65.0,
        current_ratio=1.8,
        free_cash_flow=4.5e9,
        dividend_yield=2.1,
        payout_ratio=0.35,
        beta=1.05,
    )


# --------------------------------------------------------------------------- #
# RSI
# --------------------------------------------------------------------------- #


def test_rsi_of_a_series_that_only_ever_rises_is_one_hundred():
    assert compute_rsi(series(rising(40))) == pytest.approx(100.0)


def test_rsi_of_a_series_that_only_ever_falls_is_zero():
    falling = [100.0 - 0.5 * i for i in range(40)]

    assert compute_rsi(series(falling)) == pytest.approx(0.0)


def test_rsi_of_a_flat_series_is_the_neutral_fifty():
    """No gains and no losses is undefined by the formula, not a crash."""
    assert compute_rsi(series([100.0] * 40)) == pytest.approx(50.0)


def test_rsi_matches_a_hand_computed_value_on_the_seed_window():
    """Exactly 15 closes means no smoothing yet, so the answer is arithmetic.

    Fourteen changes: ten gains of +2 (average 20/14) and four losses of -1
    (average 4/14). RS = 5, so RSI = 100 - 100/6 = 83.33.
    """
    price = 100.0
    closes = [price]
    for change in [2.0] * 10 + [-1.0] * 4:
        price += change
        closes.append(price)

    assert compute_rsi(series(closes)) == pytest.approx(100.0 - 100.0 / 6.0, abs=1e-9)


def test_equal_sized_alternating_moves_sit_just_under_the_neutral_fifty():
    """Wilder's smoothing weights the newest bar, and here it is a down bar."""
    alternating = []
    price = 100.0
    for step in range(40):
        price += 1.0 if step % 2 == 0 else -1.0
        alternating.append(price)

    assert 45.0 < compute_rsi(series(alternating)) < 50.0


def test_rsi_needs_more_observations_than_its_period():
    assert compute_rsi(series(rising(10))) is None


def test_a_stronger_uptrend_scores_a_higher_rsi_than_a_weaker_one():
    strong = compute_rsi(series([100.0 + i for i in range(40)]))
    mixed = []
    price = 100.0
    for step in range(40):
        price += 1.0 if step % 3 else -1.0
        mixed.append(price)

    assert strong > compute_rsi(series(mixed))


# --------------------------------------------------------------------------- #
# Moving averages and the cross
# --------------------------------------------------------------------------- #


def test_the_simple_moving_average_is_the_mean_of_the_last_n_closes():
    closes = series(rising(60))

    assert compute_sma(closes, 50) == pytest.approx(float(closes.iloc[-50:].mean()))


def test_a_moving_average_longer_than_the_series_is_none_rather_than_a_short_mean():
    """A 200-day average from 60 observations is not a 200-day average."""
    assert compute_sma(series(rising(60)), 200) is None


def test_a_long_uptrend_puts_the_fast_average_above_the_slow_one():
    assert detect_cross_state(series(rising(260))) == "golden"


def test_a_long_downtrend_puts_the_fast_average_below_the_slow_one():
    falling = [500.0 - 0.5 * i for i in range(260)]

    assert detect_cross_state(series(falling)) == "death"


def test_a_recent_slump_after_a_long_rally_flips_the_cross_to_death():
    rally = rising(230, start=100.0, step=1.0)
    slump = [rally[-1] - 4.0 * i for i in range(1, 61)]

    assert detect_cross_state(series(rally)) == "golden"
    assert detect_cross_state(series(rally + slump)) == "death"


def test_the_cross_is_unknown_when_the_history_is_too_short_to_have_one():
    assert detect_cross_state(series(rising(100))) == "unknown"


# --------------------------------------------------------------------------- #
# Volatility, drawdown, returns
# --------------------------------------------------------------------------- #


def test_a_perfectly_flat_series_has_zero_volatility():
    assert annualised_volatility(series([50.0] * 100)) == pytest.approx(0.0)


def test_volatility_is_the_daily_deviation_annualised_over_252_days():
    closes = series([100.0, 102.0, 99.0, 104.0, 101.0, 106.0, 103.0])
    log_returns = (closes / closes.shift(1)).apply(math.log).dropna()
    expected = float(log_returns.std(ddof=1)) * math.sqrt(252) * 100.0

    assert annualised_volatility(closes) == pytest.approx(expected)


def test_a_choppier_series_is_reported_as_more_volatile():
    calm = series([100.0 + (i % 2) * 0.2 for i in range(60)])
    wild = series([100.0 + (i % 2) * 8.0 for i in range(60)])

    assert annualised_volatility(wild) > annualised_volatility(calm)


def test_the_max_drawdown_is_the_worst_peak_to_trough_fall():
    assert max_drawdown_pct(series([100.0, 120.0, 60.0, 90.0])) == pytest.approx(-50.0)


def test_a_series_that_never_falls_has_no_drawdown():
    assert max_drawdown_pct(series(rising(50))) == pytest.approx(0.0)


def test_the_drawdown_measures_from_the_peak_not_from_the_start():
    """Ending above the start price does not erase the fall along the way."""
    assert max_drawdown_pct(series([100.0, 200.0, 150.0, 260.0])) == pytest.approx(-25.0)


def test_a_trailing_return_counts_bars_back_not_calendar_days():
    closes = series([100.0] * 30 + [110.0])

    assert trailing_return_pct(closes, 21) == pytest.approx(10.0)


def test_a_trailing_return_longer_than_the_history_is_none():
    assert trailing_return_pct(series(rising(30)), 252) is None


def test_the_momentum_score_is_fifty_when_the_price_went_nowhere():
    assert momentum_score_from_returns([0.0, 0.0, 0.0, 0.0]) == pytest.approx(50.0)


def test_the_momentum_score_is_clipped_at_both_ends():
    assert momentum_score_from_returns([500.0]) == pytest.approx(100.0)
    assert momentum_score_from_returns([-500.0]) == pytest.approx(0.0)


def test_the_momentum_score_ignores_periods_with_no_data():
    assert momentum_score_from_returns([8.0, None, None, None]) == pytest.approx(60.0)


def test_the_momentum_score_is_none_when_no_period_could_be_measured():
    assert momentum_score_from_returns([None, None]) is None


# --------------------------------------------------------------------------- #
# Technicals as a whole
# --------------------------------------------------------------------------- #


def test_computing_technicals_on_an_empty_frame_returns_empty_rather_than_raising():
    result = compute_technicals(pd.DataFrame())

    assert result.observations == 0
    assert result.points == []
    assert result.rsi14 is None
    assert result.cross_state == "unknown"


def test_the_chart_series_is_thinned_but_keeps_the_newest_close():
    closes = series(rising(1000))

    points = downsample_history(closes, max_points=250)

    assert len(points) <= 250
    assert points[-1].close == pytest.approx(float(closes.iloc[-1]))
    assert points[0].close == pytest.approx(float(closes.iloc[0]))


def test_a_short_series_is_returned_whole_with_iso_dates():
    points = downsample_history(series([10.0, 11.0, 12.0]), max_points=250)

    assert len(points) == 3
    assert points[0].date == "2022-01-03"


def test_technicals_report_where_the_price_sits_against_both_averages():
    result = compute_technicals(frame(rising(300)))

    assert result.above_sma50 is True
    assert result.above_sma200 is True
    assert result.cross_state == "golden"
    assert result.observations == 300


# --------------------------------------------------------------------------- #
# Projection
# --------------------------------------------------------------------------- #


def wobbly(count: int = 400) -> pd.Series:
    """A series with a mild upward drift and real day-to-day noise."""
    prices = [100.0]
    for step in range(count - 1):
        shock = 0.02 * math.sin(step * 1.7) + 0.01 * math.cos(step * 0.4)
        prices.append(prices[-1] * (1.0 + 0.0004 + shock))
    return series(prices)


def test_the_projection_percentiles_come_out_in_order():
    projection = project_prices(wobbly(), horizon_days=252)

    assert projection.p5 < projection.p25 < projection.median < projection.p75 < projection.p95


def test_the_projection_is_reproducible_under_its_seed():
    """The same input twice must give the same numbers, or it reads as an opinion."""
    first = project_prices(wobbly(), horizon_days=252)
    second = project_prices(wobbly(), horizon_days=252)

    assert first.median == pytest.approx(second.median)
    assert first.p5 == pytest.approx(second.p5)
    assert first.probability_below_current_pct == pytest.approx(
        second.probability_below_current_pct
    )


def test_a_different_seed_gives_a_different_draw():
    default_seed = project_prices(wobbly(), horizon_days=252)
    other_seed = project_prices(wobbly(), horizon_days=252, seed=999)

    assert default_seed.median != other_seed.median


def test_the_projection_starts_from_the_last_observed_close():
    closes = wobbly()

    projection = project_prices(closes, horizon_days=252)

    assert projection.start_price == pytest.approx(float(closes.iloc[-1]))


def test_a_wider_horizon_widens_the_distribution():
    near = project_prices(wobbly(), horizon_days=21)
    far = project_prices(wobbly(), horizon_days=504)

    assert (far.p95 - far.p5) > (near.p95 - near.p5)


def test_the_probability_of_finishing_lower_is_a_percentage():
    projection = project_prices(wobbly(), horizon_days=252)

    assert 0.0 <= projection.probability_below_current_pct <= 100.0


def test_the_projection_says_in_its_own_payload_that_it_is_not_a_forecast():
    projection = project_prices(wobbly(), horizon_days=252)

    note = projection.note.lower()
    assert "nejde o předpověď" in note
    assert "rozdělení výsledků" in note


def test_too_short_a_history_yields_no_projection_rather_than_a_guess():
    assert project_prices(series(rising(20))) is None


# --------------------------------------------------------------------------- #
# Sub-scores and their factor breakdowns
# --------------------------------------------------------------------------- #


def test_the_valuation_factors_add_up_to_the_valuation_score():
    subscore = score_valuation(full_fundamentals())

    assert subscore.score == pytest.approx(sum(f.points for f in subscore.factors), abs=0.05)


def test_the_quality_factors_add_up_to_the_quality_score():
    subscore = score_quality(full_fundamentals())

    assert subscore.score == pytest.approx(sum(f.points for f in subscore.factors), abs=0.05)


def test_the_momentum_factors_add_up_to_the_momentum_score():
    subscore = score_momentum(compute_technicals(frame(rising(300))))

    assert subscore.score == pytest.approx(sum(f.points for f in subscore.factors), abs=0.05)


def test_the_consensus_factors_add_up_to_the_consensus_score():
    subscore = score_consensus(
        AnalystConsensus(
            recommendation_key="buy",
            recommendation_cs="nákup",
            analyst_count=22,
            target_mean=140.0,
            target_high=180.0,
            target_low=100.0,
            implied_upside_pct=17.0,
        )
    )

    assert subscore.score == pytest.approx(sum(f.points for f in subscore.factors), abs=0.05)


def test_the_available_factor_maximums_always_rebase_to_one_hundred():
    """Only some factors present must still produce a comparable 0-100 score."""
    sparse = score_valuation(Fundamentals(trailing_pe=15.0))

    assert sum(f.max_points for f in sparse.factors) == pytest.approx(100.0, abs=0.05)
    assert 0.0 <= sparse.score <= 100.0


def test_every_factor_carries_its_raw_value_and_a_czech_explanation():
    subscore = score_quality(full_fundamentals())

    assert subscore.factors
    for factor in subscore.factors:
        assert factor.explanation.strip()
        assert factor.label.strip()
        assert 0.0 <= factor.points <= factor.max_points + 1e-9


def test_a_cheap_company_scores_higher_on_valuation_than_an_expensive_one():
    cheap = score_valuation(Fundamentals(trailing_pe=9.0, peg=0.6, price_to_book=1.1))
    dear = score_valuation(Fundamentals(trailing_pe=55.0, peg=4.0, price_to_book=12.0))

    assert cheap.score > dear.score


def test_a_profitable_low_debt_company_scores_higher_on_quality():
    strong = score_quality(Fundamentals(profit_margin=0.25, roe=0.28, debt_to_equity=20.0))
    weak = score_quality(Fundamentals(profit_margin=-0.05, roe=-0.03, debt_to_equity=320.0))

    assert strong.score > weak.score


def test_an_extreme_rsi_costs_momentum_points_at_both_ends():
    balanced = score_momentum(compute_technicals(frame(rising(300))))
    factor = next(f for f in balanced.factors if f.key == "rsi14")

    # A pure uptrend pins RSI at 100, which is outside the healthy band.
    assert factor.value == pytest.approx(100.0)
    assert factor.points == pytest.approx(0.0)


def test_a_subscore_with_no_inputs_is_none_with_a_stated_reason():
    empty = score_valuation(Fundamentals())

    assert empty.score is None
    assert empty.coverage == 0.0
    assert empty.unavailable_reason


def test_a_dividend_yield_is_read_as_a_percentage_either_way_yfinance_sends_it():
    assert normalise_dividend_yield(0.0153) == pytest.approx(1.53)
    assert normalise_dividend_yield(1.53) == pytest.approx(1.53)


# --------------------------------------------------------------------------- #
# Composite, verdict bands and confidence
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "score, expected",
    [
        (95.0, "Silné fundamenty"),
        (75.0, "Silné fundamenty"),
        (74.9, "Spíše příznivé"),
        (60.0, "Spíše příznivé"),
        (50.0, "Neutrální"),
        (45.0, "Neutrální"),
        (35.0, "Spíše rizikové"),
        (30.0, "Spíše rizikové"),
        (10.0, "Slabé"),
        (0.0, "Slabé"),
    ],
)
def test_the_composite_maps_onto_the_right_verdict_band(score, expected):
    verdict, detail = verdict_for_score(score)

    assert verdict == expected
    assert detail.strip()


def test_no_composite_at_all_says_so_rather_than_picking_a_band():
    verdict, _ = verdict_for_score(None)

    assert verdict == "Nedostatek dat"


def test_no_verdict_band_tells_the_user_to_trade():
    forbidden = ("kupte", "prodejte", "nakupte", "doporučujeme koupit", "držte")

    for score in (95.0, 70.0, 50.0, 35.0, 5.0, None):
        verdict, detail = verdict_for_score(score)
        combined = f"{verdict} {detail}".lower()
        assert not any(word in combined for word in forbidden)


def test_the_composite_is_the_weighted_mean_of_the_available_subscores():
    assessment = build_assessment(
        full_fundamentals(),
        compute_technicals(frame(rising(300))),
        AnalystConsensus(recommendation_key="buy", analyst_count=12, implied_upside_pct=10.0),
    )
    scored = [sub for sub in assessment.subscores if sub.score is not None]
    expected = sum(sub.score * sub.weight for sub in scored) / sum(sub.weight for sub in scored)

    assert assessment.score == pytest.approx(expected, abs=0.01)


def test_confidence_is_high_when_every_input_was_available():
    assessment = build_assessment(
        full_fundamentals(),
        compute_technicals(frame(rising(300))),
        AnalystConsensus(recommendation_key="buy", analyst_count=12, implied_upside_pct=10.0),
    )

    assert assessment.confidence > 0.9
    assert assessment.confidence_label == "vysoká"


def test_confidence_drops_when_the_inputs_are_sparse():
    rich = build_assessment(
        full_fundamentals(),
        compute_technicals(frame(rising(300))),
        AnalystConsensus(recommendation_key="buy", analyst_count=12, implied_upside_pct=10.0),
    )
    sparse = build_assessment(
        Fundamentals(trailing_pe=18.0),
        compute_technicals(frame(rising(60))),
        AnalystConsensus(),
    )

    assert sparse.confidence < rich.confidence
    assert sparse.confidence_label != "vysoká"


def test_missing_analyst_coverage_lowers_confidence_but_not_the_score_itself():
    """Dropping an unavailable sub-score is fairer than scoring it as zero."""
    covered = build_assessment(
        full_fundamentals(),
        compute_technicals(frame(rising(300))),
        AnalystConsensus(recommendation_key="hold", analyst_count=3, implied_upside_pct=-8.0),
    )
    uncovered = build_assessment(
        full_fundamentals(),
        compute_technicals(frame(rising(300))),
        AnalystConsensus(),
    )
    consensus_score = next(s for s in covered.subscores if s.key == "consensus").score

    assert next(s for s in uncovered.subscores if s.key == "consensus").score is None
    assert uncovered.confidence < covered.confidence
    assert uncovered.score > consensus_score  # the weak consensus no longer drags it


def test_a_composite_built_from_almost_nothing_is_not_given_a_verdict_band():
    """Price data alone must not produce the words 'Silné fundamenty'."""
    price_only = build_assessment(
        Fundamentals(), compute_technicals(frame(rising(300))), AnalystConsensus()
    )

    assert price_only.score is not None  # the momentum sub-score did compute
    assert price_only.confidence < 0.35
    assert price_only.verdict == "Nedostatek dat"


def test_the_assessment_lists_which_inputs_were_missing():
    assessment = build_assessment(
        Fundamentals(),
        compute_technicals(frame(rising(40))),
        AnalystConsensus(),
        missing_inputs=["ROE", "PEG"],
    )

    assert assessment.missing_inputs == ["ROE", "PEG"]


def test_an_assessment_with_nothing_at_all_still_returns_a_verdict_object():
    assessment = build_assessment(Fundamentals(), compute_technicals(pd.DataFrame()), AnalystConsensus())

    assert assessment.score is None
    assert assessment.verdict == "Nedostatek dat"
    assert assessment.confidence == pytest.approx(0.0)


# --------------------------------------------------------------------------- #
# Building from an info dict
# --------------------------------------------------------------------------- #


def test_a_quote_is_built_from_the_info_dict_including_the_52_week_position():
    technicals = compute_technicals(frame(rising(300)))
    quote = build_quote(
        "MSFT",
        {
            "longName": "Microsoft Corporation",
            "currency": "USD",
            "currentPrice": 150.0,
            "previousClose": 145.0,
            "fiftyTwoWeekHigh": 200.0,
            "fiftyTwoWeekLow": 100.0,
        },
        technicals,
    )

    assert quote.name == "Microsoft Corporation"
    assert quote.day_change_pct == pytest.approx((150 / 145 - 1) * 100)
    assert quote.position_in_52w_range == pytest.approx(0.5)


def test_a_quote_falls_back_to_the_last_observed_close_but_never_invents_one():
    technicals = compute_technicals(frame([10.0, 11.0, 12.0]))

    with_history = build_quote("XYZ", {}, technicals)
    without_history = build_quote("XYZ", {}, compute_technicals(pd.DataFrame()))

    assert with_history.price == pytest.approx(12.0)
    assert without_history.price is None
    assert without_history.day_change_pct is None


def test_unknown_fundamentals_stay_none_instead_of_becoming_zero():
    fundamentals = build_fundamentals({"trailingPE": 20.0, "profitMargins": None, "roe": "n/a"})

    assert fundamentals.trailing_pe == pytest.approx(20.0)
    assert fundamentals.profit_margin is None
    assert fundamentals.roe is None
    assert "ROE" in fundamentals.missing_fields()


def test_a_not_a_number_from_the_feed_is_treated_as_unknown():
    fundamentals = build_fundamentals({"trailingPE": float("nan"), "peg": float("inf")})

    assert fundamentals.trailing_pe is None
    assert fundamentals.peg is None


def test_the_implied_upside_is_measured_against_the_current_price():
    consensus = build_consensus(
        {"recommendationKey": "buy", "numberOfAnalystOpinions": 30}, {"mean": 120.0}, 100.0
    )

    assert consensus.implied_upside_pct == pytest.approx(20.0)
    assert consensus.recommendation_cs == "nákup"
    assert consensus.analyst_count == 30


def test_without_a_current_price_there_is_no_implied_upside():
    consensus = build_consensus({}, {"mean": 120.0}, None)

    assert consensus.target_mean == pytest.approx(120.0)
    assert consensus.implied_upside_pct is None


def test_a_known_exchange_gets_its_yahoo_suffix_and_an_unknown_one_does_not():
    assert resolve_symbol("cez", "PRA") == "CEZ.PR"
    assert resolve_symbol("aapl", "NASDAQ") == "AAPL"
    assert resolve_symbol("BMW.DE", "XETRA") == "BMW.DE"


# --------------------------------------------------------------------------- #
# Serialisation
# --------------------------------------------------------------------------- #


def sample_analysis() -> TickerAnalysis:
    history = frame(rising(400))
    technicals = compute_technicals(history)
    fundamentals = full_fundamentals()
    consensus = build_consensus(
        {"recommendationKey": "buy", "numberOfAnalystOpinions": 18}, {"mean": 300.0}, 250.0
    )
    return TickerAnalysis(
        ticker="TEST",
        resolved_symbol="TEST",
        generated_at="2026-08-24T10:00:00+00:00",
        lookback_days=730,
        horizon_days=252,
        quote=build_quote("TEST", {"longName": "Test Corp"}, technicals),
        fundamentals=fundamentals,
        technicals=technicals,
        projection=project_prices(close_series(history), horizon_days=252),
        consensus=consensus,
        assessment=build_assessment(fundamentals, technicals, consensus, ["beta"]),
        narrative=Narrative(text=None, model=None, generated=False, note="bez komentáře"),
        missing_data=["beta"],
    )


def test_the_serialised_analysis_survives_a_json_round_trip():
    payload = to_dict(sample_analysis())

    restored = json.loads(json.dumps(payload, allow_nan=False))

    assert restored["ticker"] == "TEST"
    assert restored["assessment"]["verdict"]
    assert restored["disclaimer"]


def test_the_serialised_analysis_contains_only_plain_json_types():
    payload = to_dict(sample_analysis())

    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                assert isinstance(key, str)
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)
        else:
            assert node is None or isinstance(node, (bool, int, float, str)), type(node)

    walk(payload)


def test_dates_in_the_serialised_price_series_are_iso_strings():
    payload = to_dict(sample_analysis())

    first = payload["technicals"]["points"][0]
    assert date.fromisoformat(first["date"])
    assert isinstance(first["close"], float)


def test_a_missing_projection_serialises_as_null_not_as_zeros():
    analysis = sample_analysis()
    analysis.projection = None

    payload = to_dict(analysis)

    assert payload["projection"] is None
    json.dumps(payload, allow_nan=False)


def test_non_finite_numbers_never_reach_the_json_payload():
    analysis = sample_analysis()
    analysis.fundamentals.beta = float("nan")

    payload = to_dict(analysis)

    assert payload["fundamentals"]["beta"] is None
    json.dumps(payload, allow_nan=False)


def test_the_disclaimer_names_all_three_limitations():
    payload = to_dict(sample_analysis())
    disclaimer = payload["disclaimer"].lower()

    assert "není investiční doporučení" in disclaimer
    assert "zpožděná" in disclaimer
    assert "nikoli předpověď" in disclaimer


def test_the_factor_breakdown_is_present_in_the_serialised_payload():
    payload = to_dict(sample_analysis())

    valuation = next(s for s in payload["assessment"]["subscores"] if s["key"] == "valuation")
    assert valuation["factors"]
    assert {"key", "label", "value", "points", "max_points", "explanation"} <= set(
        valuation["factors"][0]
    )


def test_without_an_api_key_the_narrative_says_the_numbers_stand_alone():
    """The written commentary is a garnish; its absence is stated, not hidden."""
    analysis = sample_analysis()

    payload = to_dict(analysis)

    assert payload["narrative"]["generated"] is False
    assert payload["narrative"]["text"] is None
