"""Wraps the engineer-investor-portfolio library into plain dict/list responses."""

import pandas as pd
from portfolio_analysis import (
    BenchmarkComparison,
    DataLoader,
    MonteCarloSimulation,
    PortfolioAnalysis,
    PortfolioOptimizer,
)
from app.schemas import (
    AnalyzeResponse,
    CorrelationRequest,
    CorrelationResponse,
    MonteCarloRequest,
    MonteCarloResponse,
    OptimizeRequest,
    OptimizeResponse,
    PortfolioRequest,
    QuantBenchmarkRequest,
    QuantBenchmarkResponse,
)


class AnalysisError(Exception):
    """Raised for any input/data problem; caught by the API layer as a 400."""


def _load_prices(tickers: list[str], start_date: str, end_date: str) -> pd.DataFrame:
    try:
        data = DataLoader(tickers, start_date, end_date).fetch_data(progress=False)
    except Exception as exc:  # yfinance/network failures
        raise AnalysisError(f"Could not fetch price data: {exc}") from exc

    if data.empty:
        raise AnalysisError("No price data returned for the given tickers/date range.")

    missing = [t for t in tickers if t not in data.columns]
    if missing:
        raise AnalysisError(f"No data found for: {', '.join(missing)}")

    return data.dropna()


def _series_points(series: pd.Series) -> list[dict]:
    return [{"date": idx.strftime("%Y-%m-%d"), "value": float(v)} for idx, v in series.items()]


def analyze_portfolio(req: PortfolioRequest) -> AnalyzeResponse:
    if len(req.tickers) != len(req.weights):
        raise AnalysisError("Number of tickers must match number of weights.")

    data = _load_prices(req.tickers, req.start_date, req.end_date)
    data = data[req.tickers]

    try:
        portfolio = PortfolioAnalysis(data, req.weights)
        summary = portfolio.get_summary(req.risk_free_rate)
        equity_curve = portfolio.calculate_cumulative_returns()
    except (ValueError, KeyError) as exc:
        raise AnalysisError(str(exc)) from exc

    asset_curves = {
        ticker: _series_points((1 + data[ticker].pct_change().dropna()).cumprod())
        for ticker in req.tickers
    }

    return AnalyzeResponse(
        metrics=summary,
        equity_curve=_series_points(equity_curve),
        allocation=[{"ticker": t, "weight": w} for t, w in zip(req.tickers, req.weights)],
        asset_curves=asset_curves,
    )


def compare_benchmark(req: QuantBenchmarkRequest) -> QuantBenchmarkResponse:
    if len(req.tickers) != len(req.weights):
        raise AnalysisError("Number of tickers must match number of weights.")

    data = _load_prices(req.tickers, req.start_date, req.end_date)
    data = data[req.tickers]

    try:
        comparison = BenchmarkComparison(
            data, req.weights, benchmark_ticker=req.benchmark_ticker, risk_free_rate=req.risk_free_rate
        )
        metrics = comparison.get_metrics()
    except (ValueError, KeyError) as exc:
        raise AnalysisError(str(exc)) from exc

    portfolio_curve = (1 + comparison.portfolio_returns).cumprod()
    benchmark_curve = (1 + comparison.benchmark_returns).cumprod()

    return QuantBenchmarkResponse(
        metrics=metrics,
        portfolio_curve=_series_points(portfolio_curve),
        benchmark_curve=_series_points(benchmark_curve),
    )


def run_monte_carlo(req: MonteCarloRequest) -> MonteCarloResponse:
    if len(req.tickers) != len(req.weights):
        raise AnalysisError("Number of tickers must match number of weights.")

    data = _load_prices(req.tickers, req.start_date, req.end_date)
    data = data[req.tickers]

    try:
        mc = MonteCarloSimulation(
            data,
            req.weights,
            num_simulations=req.num_simulations,
            time_horizon=req.time_horizon,
            initial_investment=req.initial_investment,
        )
        stats = mc.get_statistics()
    except (ValueError, KeyError) as exc:
        raise AnalysisError(str(exc)) from exc

    # Downsample bands to at most ~120 points so the payload stays small.
    step = max(1, req.time_horizon // 120)
    bands = {
        str(p): [float(v) for v in values[::step]]
        for p, values in stats["percentiles"].items()
    }

    return MonteCarloResponse(
        final_values={k: float(v) for k, v in stats["final_values"].items()},
        percentile_bands=bands,
        initial_investment=req.initial_investment,
        time_horizon=req.time_horizon,
        num_simulations=req.num_simulations,
    )


def _correlation_from_returns(data: pd.DataFrame, tickers: list[str]) -> list[list[float]]:
    """Pure so the matrix math is testable without a network call."""
    returns = data[tickers].pct_change().dropna()
    corr = returns.corr()
    return [[round(float(corr.loc[a, b]), 4) for b in tickers] for a in tickers]


def correlation_matrix(req: CorrelationRequest) -> CorrelationResponse:
    tickers = [t.strip().upper() for t in req.tickers]
    if len(set(tickers)) < 2:
        raise AnalysisError("Correlation needs at least two distinct tickers.")

    data = _load_prices(tickers, req.start_date, req.end_date)
    matrix = _correlation_from_returns(data, tickers)

    return CorrelationResponse(tickers=tickers, matrix=matrix)


def optimize_portfolio(req: OptimizeRequest) -> OptimizeResponse:
    data = _load_prices(req.tickers, req.start_date, req.end_date)
    data = data[req.tickers]

    try:
        optimizer = PortfolioOptimizer(data, risk_free_rate=req.risk_free_rate)
        if req.strategy == "max_sharpe":
            result = optimizer.optimize_max_sharpe()
        elif req.strategy == "min_volatility":
            result = optimizer.optimize_min_volatility()
        else:
            result = optimizer.optimize_risk_parity()
    except (ValueError, KeyError) as exc:
        raise AnalysisError(str(exc)) from exc

    current = None
    if req.current_weights:
        if len(req.current_weights) != len(req.tickers):
            raise AnalysisError("Number of current_weights must match number of tickers.")
        try:
            current_portfolio = PortfolioAnalysis(data, req.current_weights)
            current = {
                "return": current_portfolio.calculate_portfolio_return(),
                "volatility": current_portfolio.calculate_portfolio_volatility(),
                "sharpe_ratio": current_portfolio.calculate_portfolio_sharpe_ratio(req.risk_free_rate),
            }
        except (ValueError, KeyError) as exc:
            raise AnalysisError(str(exc)) from exc

    return OptimizeResponse(
        strategy=req.strategy,
        weights={k: float(v) for k, v in result["weights"].items()},
        expected_return=float(result["return"]),
        volatility=float(result["volatility"]),
        sharpe_ratio=float(result["sharpe_ratio"]),
        current=current,
    )
