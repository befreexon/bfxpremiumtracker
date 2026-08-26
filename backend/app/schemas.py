"""Request and response models."""

import datetime as dt

from pydantic import BaseModel, EmailStr, Field, field_validator

# --------------------------------------------------------------------------
# Auth and settings
# --------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=200)
    display_name: str = Field("", max_length=120)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    tax_test_years: int
    tax_exempt_cap_czk: float
    benchmark_ticker: str


class UserSettingsUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=120)
    tax_test_years: int | None = Field(None, ge=1, le=20)
    tax_exempt_cap_czk: float | None = Field(None, ge=0)
    benchmark_ticker: str | None = Field(None, max_length=32)


# --------------------------------------------------------------------------
# Portfolios
# --------------------------------------------------------------------------


class PortfolioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    note: str = Field("", max_length=2000)


class PortfolioUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    note: str | None = Field(None, max_length=2000)


class PortfolioResponse(BaseModel):
    id: int
    name: str
    note: str
    created_at: dt.datetime
    transaction_count: int = 0


# --------------------------------------------------------------------------
# Transactions
# --------------------------------------------------------------------------

TRANSACTION_TYPES = ("BUY", "SELL", "DIV", "ADJUST")
ASSET_CLASSES = ("STOCK", "ETF", "CRYPTO")


class TransactionBase(BaseModel):
    type: str
    date: dt.date
    ticker: str = Field(..., min_length=1, max_length=32)
    exchange: str = Field(..., min_length=1, max_length=16)
    asset_class: str
    quantity: float
    price: float
    currency: str = Field(..., min_length=2, max_length=8)
    fee: float = 0.0
    fx_rate: float | None = None
    isin: str = Field("", max_length=16)
    name: str = Field("", max_length=200)
    note: str = Field("", max_length=2000)

    @field_validator("type")
    @classmethod
    def _known_type(cls, value: str) -> str:
        value = value.upper()
        if value not in TRANSACTION_TYPES:
            raise ValueError(f"Neznámý typ transakce. Povolené: {', '.join(TRANSACTION_TYPES)}.")
        return value

    @field_validator("asset_class")
    @classmethod
    def _known_class(cls, value: str) -> str:
        value = value.upper()
        if value not in ASSET_CLASSES:
            raise ValueError(f"Neznámá třída aktiva. Povolené: {', '.join(ASSET_CLASSES)}.")
        return value

    @field_validator("ticker", "exchange")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.strip().upper()


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    type: str | None = None
    date: dt.date | None = None
    ticker: str | None = None
    exchange: str | None = None
    asset_class: str | None = None
    quantity: float | None = None
    price: float | None = None
    currency: str | None = None
    fee: float | None = None
    fx_rate: float | None = None
    isin: str | None = None
    name: str | None = None
    note: str | None = None


class TransactionResponse(TransactionBase):
    id: int
    portfolio_id: int
    portfolio_name: str = ""


# --------------------------------------------------------------------------
# Rebalancing — target allocation by asset class
# --------------------------------------------------------------------------


class RebalanceTargetsSet(BaseModel):
    #: asset_class -> target percentage (0-100). A class left out is treated
    #: as having no target and is excluded from the suggestion list.
    targets: dict[str, float]

    @field_validator("targets")
    @classmethod
    def _known_classes_and_range(cls, value: dict[str, float]) -> dict[str, float]:
        for asset_class, pct in value.items():
            if asset_class not in ASSET_CLASSES:
                raise ValueError(f"Neznámá třída aktiva. Povolené: {', '.join(ASSET_CLASSES)}.")
            if pct < 0 or pct > 100:
                raise ValueError("Cílové procento musí být mezi 0 a 100.")
        return value


class RebalanceSuggestion(BaseModel):
    asset_class: str
    target_pct: float
    current_pct: float
    current_value_czk: float
    target_value_czk: float
    delta_czk: float  # positive = buy this much more, negative = sell


class RebalanceResponse(BaseModel):
    targets_sum_pct: float
    suggestions: list[RebalanceSuggestion]


# --------------------------------------------------------------------------
# Tax-loss harvesting
# --------------------------------------------------------------------------


class TaxLossCandidate(BaseModel):
    instrument_key: str
    ticker: str
    lot_date: dt.date
    quantity: float
    unrealized_loss_czk: float
    tax_test_status: str
    tax_test_days_remaining: int | None


class TaxLossResponse(BaseModel):
    taxable_gain_ytd_czk: float
    candidates: list[TaxLossCandidate]


# --------------------------------------------------------------------------
# Net worth — manual assets outside the securities engine
# --------------------------------------------------------------------------

ASSET_CATEGORIES = ("CASH", "REAL_ESTATE", "OTHER")


class ManualAssetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: str = Field("OTHER")
    value_czk: float = Field(..., ge=0)
    note: str = Field("", max_length=2000)

    @field_validator("category")
    @classmethod
    def _known_category(cls, value: str) -> str:
        value = value.upper()
        if value not in ASSET_CATEGORIES:
            raise ValueError(f"Neznámá kategorie. Povolené: {', '.join(ASSET_CATEGORIES)}.")
        return value


class ManualAssetUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    category: str | None = None
    value_czk: float | None = Field(None, ge=0)
    note: str | None = Field(None, max_length=2000)

    @field_validator("category")
    @classmethod
    def _known_category(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.upper()
        if value not in ASSET_CATEGORIES:
            raise ValueError(f"Neznámá kategorie. Povolené: {', '.join(ASSET_CATEGORIES)}.")
        return value


class ManualAssetResponse(BaseModel):
    id: int
    name: str
    category: str
    value_czk: float
    note: str
    updated_at: dt.datetime


class NetWorthResponse(BaseModel):
    securities_value_czk: float
    manual_assets: list[ManualAssetResponse]
    manual_assets_total_czk: float
    net_worth_czk: float


# --------------------------------------------------------------------------
# Segments ("Vlastní rozdělení" — the user's own custom breakdown)
# --------------------------------------------------------------------------


class SegmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: str = Field("#dcb45c", max_length=16)


class SegmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    color: str | None = Field(None, max_length=16)


class SegmentResponse(BaseModel):
    id: int
    name: str
    color: str
    member_instrument_keys: list[str] = []


class SegmentAssign(BaseModel):
    instrument_key: str = Field(..., min_length=1, max_length=64)
    segment_id: int | None = None  # None unassigns the instrument


# --------------------------------------------------------------------------
# Notes (per-ticker, AI analýza)
# --------------------------------------------------------------------------


class NoteCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    text: str = Field(..., min_length=1, max_length=4000)


class NoteResponse(BaseModel):
    id: int
    symbol: str
    text: str
    created_at: dt.datetime


# --------------------------------------------------------------------------
# Watchlist
# --------------------------------------------------------------------------


class WatchlistCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=32)
    exchange: str = Field(..., min_length=1, max_length=16)
    currency: str = Field(..., min_length=2, max_length=8)
    asset_class: str = "STOCK"
    name: str = Field("", max_length=200)
    group_name: str = Field("Čekám na vstup", max_length=64)
    # Required on purpose: without a number this is a wish list, not a plan.
    target_price: float = Field(..., gt=0)
    note: str = Field("", max_length=2000)

    @field_validator("ticker", "exchange")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.strip().upper()


class WatchlistUpdate(BaseModel):
    group_name: str | None = Field(None, max_length=64)
    target_price: float | None = Field(None, gt=0)
    note: str | None = Field(None, max_length=2000)
    name: str | None = Field(None, max_length=200)


class WatchlistResponse(BaseModel):
    id: int
    ticker: str
    exchange: str
    currency: str
    asset_class: str
    name: str
    group_name: str
    target_price: float
    note: str
    added_at: dt.date
    price_at_add: float | None
    current_price: float | None
    price_as_of: str | None
    distance_to_target_pct: float | None
    change_since_added_pct: float | None
    target_reached: bool
    archived_at: dt.date | None
    moved_to_portfolio_id: int | None


class WatchlistBuy(BaseModel):
    portfolio_id: int
    date: dt.date
    quantity: float = Field(..., gt=0)
    price: float = Field(..., gt=0)
    fee: float = 0.0
    fx_rate: float | None = None


# --------------------------------------------------------------------------
# Prices and rates
# --------------------------------------------------------------------------


class ManualPriceRequest(BaseModel):
    instrument_key: str
    price: float = Field(..., gt=0)


class ManualFxRequest(BaseModel):
    currency: str
    date: dt.date
    rate: float = Field(..., gt=0)


class RefreshRequest(BaseModel):
    portfolio_ids: list[int] | None = None


# --------------------------------------------------------------------------
# CSV import
# --------------------------------------------------------------------------


class ImportPreviewRow(BaseModel):
    line_number: int
    status: str
    messages: list[str]
    data: dict | None
    raw: dict


class ImportPreviewResponse(BaseModel):
    delimiter: str
    fatal_error: str | None
    new_portfolios: list[str]
    counts: dict[str, int]
    rows: list[ImportPreviewRow]
    token: str


class ImportCommitRequest(BaseModel):
    token: str
    portfolio_id: int | None = None


class ImportCommitResponse(BaseModel):
    imported: int
    skipped: int
    created_portfolios: list[str]


# --------------------------------------------------------------------------
# Snapshots and benchmark
# --------------------------------------------------------------------------


class SnapshotResponse(BaseModel):
    date: str
    value_czk: float
    invested_czk: float
    benchmark_czk: float | None


class BenchmarkResponse(BaseModel):
    ticker: str
    benchmark_value_czk: float | None
    portfolio_value_czk: float
    difference_czk: float | None
    computed_at: str
    is_manual: bool = False
    note: str | None = None


class ManualBenchmarkRequest(BaseModel):
    portfolio_id: int
    value_czk: float = Field(..., ge=0)


# --------------------------------------------------------------------------
# Quantitative analysis (portfolio-level, the original layer)
# --------------------------------------------------------------------------


class PortfolioRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1)
    weights: list[float] = Field(..., min_length=1)
    start_date: str
    end_date: str
    risk_free_rate: float = Field(0.04, ge=0, le=1)


class QuantBenchmarkRequest(PortfolioRequest):
    benchmark_ticker: str = "SPY"


class MonteCarloRequest(PortfolioRequest):
    num_simulations: int = Field(1000, ge=100, le=5000)
    time_horizon: int = Field(252, ge=21, le=1260)
    initial_investment: float = Field(10000, ge=100)


class OptimizeRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=2)
    current_weights: list[float] | None = None
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


class QuantBenchmarkResponse(BaseModel):
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


# --------------------------------------------------------------------------
# AI analysis
# --------------------------------------------------------------------------


class AiAnalysisRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=32)
    exchange: str = Field("", max_length=16)
    horizon_days: int = Field(252, ge=21, le=1260)
    lookback_days: int = Field(730, ge=120, le=3650)
    include_narrative: bool = True
