"""Correlation matrix: pure pairwise-correlation math, plus the
duplicate/too-few-tickers guard — both testable without a network call."""

import pandas as pd
import pytest

from app.schemas import CorrelationRequest
from app.services.quant import AnalysisError, _correlation_from_returns, correlation_matrix


def _prices() -> pd.DataFrame:
    # B moves in lockstep with A; C moves opposite to A.
    dates = pd.date_range("2024-01-01", periods=6, freq="D")
    a = [100, 101, 102, 101, 103, 104]
    b = [50, 50.5, 51, 50.5, 51.5, 52]
    c = [200, 198, 196, 198, 194, 192]
    return pd.DataFrame({"A": a, "B": b, "C": c}, index=dates)


def test_perfectly_correlated_pair_is_one():
    matrix = _correlation_from_returns(_prices(), ["A", "B"])
    assert matrix[0][1] == pytest.approx(1.0, abs=1e-3)
    assert matrix[1][0] == pytest.approx(1.0, abs=1e-3)


def test_diagonal_is_always_one():
    matrix = _correlation_from_returns(_prices(), ["A", "B", "C"])
    for i in range(3):
        assert matrix[i][i] == pytest.approx(1.0, abs=1e-9)


def test_inversely_correlated_pair_is_negative():
    matrix = _correlation_from_returns(_prices(), ["A", "C"])
    assert matrix[0][1] < 0


def test_matrix_is_symmetric():
    matrix = _correlation_from_returns(_prices(), ["A", "B", "C"])
    for i in range(3):
        for j in range(3):
            assert matrix[i][j] == pytest.approx(matrix[j][i], abs=1e-9)


def test_duplicate_ticker_is_rejected_before_any_fetch():
    req = CorrelationRequest(tickers=["AAPL", "aapl"], start_date="2024-01-01", end_date="2024-06-01")
    with pytest.raises(AnalysisError):
        correlation_matrix(req)
