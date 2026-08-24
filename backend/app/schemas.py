"""Request/response models for the BFX Portfolio Pro API."""

from pydantic import BaseModel, Field


class PortfolioRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, description="Ticker symbols, e.g. ['VTI', 'BND']")
    weights: list[float] = Field(..., min_length=1, description="Portfolio weights, must sum to 1.0")
    start_date: str = Field(..., description="YYYY-MM-DD")
    end_date: str = Field(..., description="YYYY-MM-DD")
    risk_free_rate: float = Field(0.04, ge=0, le=1)


class BenchmarkRequest(PortfolioRequest):
    benchmark_ticker: str = Field("SPY", description="Benchmark ticker symbol")


class MonteCarloRequest(PortfolioRequest):
    num_simulations: int = Field(1000, ge=100, le=5000)
    time_horizon: int = Field(252, ge=21, le=1260)
    initial_investment: float = Field(10000, ge=100)


class OptimizeRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=2)
    current_weights: list[float] | None = Field(None, description="Current weights, for comparison")
    start_date: str
    end_date: str
    risk_free_rate: float = Field(0.04, ge=0, le=1)
    strategy: str = Field("max_sharpe", pattern="^(max_sharpe|min_volatility|risk_parity)$")


class SeriesPoint(BaseModel):
    date: str
    value: float


class AllocationSlice(BaseModel):
    ticker: str
    weight: float


class AnalyzeResponse(BaseModel):
    metrics: dict[str, float]
    equity_curve: list[SeriesPoint]
    allocation: list[AllocationSlice]
    asset_curves: dict[str, list[SeriesPoint]]


class BenchmarkResponse(BaseModel):
    metrics: dict[str, float]
    portfolio_curve: list[SeriesPoint]
    benchmark_curve: list[SeriesPoint]


class MonteCarloResponse(BaseModel):
    final_values: dict[str, float]
    percentile_bands: dict[str, list[float]]
    initial_investment: float
    time_horizon: int
    num_simulations: int


class OptimizeResponse(BaseModel):
    strategy: str
    weights: dict[str, float]
    expected_return: float
    volatility: float
    sharpe_ratio: float
    current: dict[str, float] | None = None
