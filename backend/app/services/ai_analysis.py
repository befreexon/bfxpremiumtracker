"""Third layer of the app: a transparent, traceable analysis of a single ticker.

The user is a portfolio manager, not someone looking for a tip. So nothing here
is allowed to be a black box: every score is the sum of named factors, every
factor carries the raw value it was computed from, and the projection states in
its own payload that it is a distribution implied by past volatility rather than
a forecast.

Two rules run through the whole module:

* **Never fabricate a number.** A missing datum becomes ``None`` and is recorded
  in ``missing_data``. A zero standing in for "we don't know" would be read as a
  real measurement, and a zero P/E or a zero dividend yield is a statement about
  the company, not about the data feed.
* **Degrade, don't fail.** yfinance is a free scraper of someone else's site; it
  is flaky by nature. Every external call is wrapped. The only thing worth
  raising for is the price history — without it there is no analysis at all —
  and that raises :class:`AnalysisUnavailable` so the API can answer in Czech.

The maths lives in pure functions that take a ``DataFrame`` or a plain dict, so
the whole computation is testable with synthetic data and no network. Only
:func:`analyze_ticker` does I/O.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from app import config

TRADING_DAYS_PER_YEAR = 252
RSI_PERIOD = 14
SMA_FAST = 50
SMA_SLOW = 200

# The chart in the UI is a few hundred pixels wide; sending two years of daily
# closes would be mostly bytes the browser throws away.
MAX_HISTORY_POINTS = 250

PROJECTION_PATHS = 2000
PROJECTION_SEED = 20240101  # fixed so the same ticker gives the same answer twice

# Relative weight of each sub-score in the composite. Quality carries the most
# because it is the slowest-moving and least noisy of the four.
SUBSCORE_WEIGHTS = {
    "valuation": 0.25,
    "quality": 0.30,
    "momentum": 0.25,
    "consensus": 0.20,
}

# Below this confidence the composite still exists but is not given a verdict
# band — see build_assessment.
MIN_CONFIDENCE_FOR_VERDICT = 0.35

DISCLAIMER = (
    "Tato analýza není investiční doporučení ani nabídka k obchodování. "
    "Vychází z veřejně dostupných dat (Yahoo Finance), která mohou být nepřesná, "
    "neúplná nebo zpožděná. Projekce je rozdělení možných výsledků odvozené "
    "z historické volatility, nikoli předpověď budoucí ceny. Rozhodnutí o nákupu "
    "či prodeji je vždy na vás."
)

NARRATIVE_SYSTEM_PROMPT = (
    "Jsi analytik pracující pro portfolio manažera. Dostaneš spočítaná čísla "
    "o jedné akcii a napíšeš k nim střízlivý komentář v češtině, maximálně 250 slov.\n"
    "Pravidla:\n"
    "- Nikdy nedoporučuj nákup, prodej ani držení. Popisuj, co čísla ukazují, "
    "a co z nich plyne za rizika a příležitosti.\n"
    "- Pracuj jen s čísly, která dostaneš. Nic si nedomýšlej a nedoplňuj údaje "
    "z paměti — pokud údaj chybí, napiš, že chybí.\n"
    "- Zmiň, kde si čísla odporují (např. silné fundamenty proti slabému momentu).\n"
    "- Žádné superlativy, žádná marketingová řeč, žádné emoji.\n"
    "- Piš souvislý text v odstavcích, ne odrážky."
)

# yfinance returns the plain ticker for US venues but wants a suffix elsewhere.
# Only the venues this app actually sees are listed; anything else falls through
# to the bare symbol, which is better than guessing a wrong suffix.
EXCHANGE_SUFFIXES = {
    "PRA": ".PR",
    "PSE": ".PR",
    "XETRA": ".DE",
    "FRA": ".F",
    "LSE": ".L",
    "WSE": ".WA",
    "BUD": ".BD",
    "SWX": ".SW",
    "AMS": ".AS",
    "PAR": ".PA",
    "MIL": ".MI",
    "MCE": ".MC",
    "STO": ".ST",
    "OSL": ".OL",
    "CPH": ".CO",
    "TSX": ".TO",
    "ASX": ".AX",
    "TYO": ".T",
}

RECOMMENDATION_LABELS_CS = {
    "strong_buy": "silný nákup",
    "buy": "nákup",
    "outperform": "překonání trhu",
    "hold": "držet",
    "neutral": "neutrální",
    "underperform": "zaostání za trhem",
    "sell": "prodej",
    "strong_sell": "silný prodej",
}


class AnalysisUnavailable(Exception):
    """Raised only when even the price history could not be obtained.

    Everything else degrades to ``None``. This exception means there is nothing
    to show at all, so the router can turn it into one clean Czech message
    instead of rendering a page full of dashes.
    """


# --------------------------------------------------------------------------- #
# Dataclasses
# --------------------------------------------------------------------------- #


@dataclass
class Quote:
    ticker: str
    name: str | None = None
    exchange: str | None = None
    currency: str | None = None
    sector: str | None = None
    industry: str | None = None

    price: float | None = None
    previous_close: float | None = None
    day_change_pct: float | None = None

    week52_high: float | None = None
    week52_low: float | None = None
    # 0 = at the 52-week low, 1 = at the 52-week high.
    position_in_52w_range: float | None = None

    def missing_fields(self) -> list[str]:
        labels = {
            "name": "název",
            "currency": "měna",
            "sector": "sektor",
            "industry": "odvětví",
            "previous_close": "předchozí zavírací cena",
            "week52_high": "52týdenní maximum",
            "week52_low": "52týdenní minimum",
        }
        return [label for attr, label in labels.items() if getattr(self, attr) is None]


@dataclass
class Fundamentals:
    market_cap: float | None = None
    trailing_pe: float | None = None
    forward_pe: float | None = None
    peg: float | None = None
    price_to_book: float | None = None
    price_to_sales: float | None = None
    ev_to_ebitda: float | None = None
    ev_to_fcf: float | None = None
    profit_margin: float | None = None
    roe: float | None = None
    roa: float | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None
    debt_to_equity: float | None = None
    current_ratio: float | None = None
    free_cash_flow: float | None = None
    #: Free cash flow over market cap — a percentage, unlike free_cash_flow itself.
    fcf_yield: float | None = None
    #: 1 / trailing P/E as a percentage — the inverse framing of the same number.
    earnings_yield: float | None = None
    dividend_yield: float | None = None
    payout_ratio: float | None = None
    beta: float | None = None

    def missing_fields(self) -> list[str]:
        labels = {
            "market_cap": "tržní kapitalizace",
            "trailing_pe": "P/E (trailing)",
            "forward_pe": "P/E (forward)",
            "peg": "PEG",
            "price_to_book": "P/B",
            "price_to_sales": "P/S",
            "ev_to_ebitda": "EV/EBITDA",
            "ev_to_fcf": "EV/FCF",
            "profit_margin": "čistá marže",
            "roe": "ROE",
            "roa": "ROA",
            "revenue_growth": "růst tržeb",
            "earnings_growth": "růst zisku",
            "debt_to_equity": "poměr dluhu k vlastnímu kapitálu",
            "current_ratio": "běžná likvidita",
            "free_cash_flow": "volný cash flow",
            "fcf_yield": "FCF výnos",
            "earnings_yield": "earnings yield",
            "dividend_yield": "dividendový výnos",
            "payout_ratio": "výplatní poměr",
            "beta": "beta",
        }
        return [label for attr, label in labels.items() if getattr(self, attr) is None]


@dataclass(frozen=True)
class PricePoint:
    date: str  # ISO date, already a string so the payload needs no conversion
    close: float


@dataclass
class Technicals:
    points: list[PricePoint] = field(default_factory=list)
    first_date: str | None = None
    last_date: str | None = None
    observations: int = 0

    sma50: float | None = None
    sma200: float | None = None
    above_sma50: bool | None = None
    above_sma200: bool | None = None
    cross_state: str = "unknown"  # golden | death | none | unknown
    cross_state_cs: str = "neurčeno"

    rsi14: float | None = None
    volatility_annual_pct: float | None = None
    max_drawdown_pct: float | None = None

    return_1m_pct: float | None = None
    return_3m_pct: float | None = None
    return_6m_pct: float | None = None
    return_1y_pct: float | None = None
    momentum_score: float | None = None

    def missing_fields(self) -> list[str]:
        labels = {
            "sma50": "SMA50",
            "sma200": "SMA200",
            "rsi14": "RSI(14)",
            "volatility_annual_pct": "roční volatilita",
            "return_1m_pct": "výnos za 1 měsíc",
            "return_3m_pct": "výnos za 3 měsíce",
            "return_6m_pct": "výnos za 6 měsíců",
            "return_1y_pct": "výnos za 1 rok",
        }
        return [label for attr, label in labels.items() if getattr(self, attr) is None]


@dataclass
class Projection:
    horizon_days: int
    paths: int
    seed: int
    observations: int

    drift_daily: float
    volatility_daily: float
    start_price: float

    p5: float
    p25: float
    median: float
    p75: float
    p95: float
    expected_return_pct: float
    probability_below_current_pct: float

    method: str = "monte_carlo_lognormal"
    note: str = (
        "Nejde o předpověď ceny. Je to rozdělení výsledků, které by vyšlo, kdyby se "
        "budoucnost chovala jako historické denní výnosy v daném okně — stejný "
        "průměrný drift, stejná volatilita. Skutečnost se řídí událostmi, které "
        "v historických datech nejsou."
    )


@dataclass
class AnalystConsensus:
    recommendation_key: str | None = None
    recommendation_cs: str | None = None
    analyst_count: int | None = None
    target_mean: float | None = None
    target_high: float | None = None
    target_low: float | None = None
    implied_upside_pct: float | None = None

    def missing_fields(self) -> list[str]:
        labels = {
            "recommendation_key": "konsensus analytiků",
            "analyst_count": "počet analytiků",
            "target_mean": "průměrná cílová cena",
            "target_high": "nejvyšší cílová cena",
            "target_low": "nejnižší cílová cena",
        }
        return [label for attr, label in labels.items() if getattr(self, attr) is None]


@dataclass(frozen=True)
class ScoreFactor:
    """One visible line of a sub-score: what was measured and what it was worth."""

    key: str
    label: str  # Czech
    value: float | None
    unit: str  # "", "%", "x", "CZK"...
    points: float
    max_points: float
    explanation: str  # Czech


@dataclass
class SubScore:
    key: str
    label: str  # Czech
    score: float | None  # 0-100, None when no factor could be computed
    weight: float
    coverage: float  # share of this sub-score's factors that had data, 0-1
    factors: list[ScoreFactor] = field(default_factory=list)
    unavailable_reason: str | None = None


@dataclass
class Assessment:
    score: float | None
    verdict: str
    verdict_detail: str
    confidence: float  # 0-1
    confidence_label: str
    subscores: list[SubScore] = field(default_factory=list)
    missing_inputs: list[str] = field(default_factory=list)


@dataclass
class Narrative:
    text: str | None
    model: str | None
    generated: bool
    note: str


@dataclass
class TickerAnalysis:
    ticker: str
    resolved_symbol: str
    generated_at: str
    lookback_days: int
    horizon_days: int

    quote: Quote
    fundamentals: Fundamentals
    technicals: Technicals
    projection: Projection | None
    consensus: AnalystConsensus
    assessment: Assessment
    narrative: Narrative

    missing_data: list[str] = field(default_factory=list)
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------------- #
# Small numeric helpers
# --------------------------------------------------------------------------- #


def _clean(value) -> float | None:
    """Turns anything yfinance hands back into a real float, or None.

    yfinance mixes ``None``, ``nan``, numpy scalars and occasionally strings in
    the same dict. Anything that is not a finite number is unknown, and unknown
    must stay ``None`` rather than collapse to 0.0.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _fmt(value: float | None, decimals: int = 2) -> str:
    """Czech decimal formatting — comma, not point."""
    if value is None:
        return "neuvedeno"
    return f"{value:,.{decimals}f}".replace(",", " ").replace(".", ",")


def _linear_points(
    value: float, *, zero_at: float, full_at: float, max_points: float
) -> float:
    """Straight-line mapping of a raw metric onto points, clipped at both ends.

    ``full_at`` may be below ``zero_at`` — that is how "lower is better" metrics
    such as P/E are expressed, without a second function.
    """
    span = full_at - zero_at
    if span == 0:
        return max_points if value >= full_at else 0.0
    fraction = (value - zero_at) / span
    return max(0.0, min(1.0, fraction)) * max_points


def _plateau_points(
    value: float,
    *,
    zero_below: float,
    full_from: float,
    full_to: float,
    zero_above: float,
    max_points: float,
) -> float:
    """Trapezoid mapping, for metrics where both extremes are bad.

    RSI is the case this exists for: 15 is not "better" than 55, it is a
    different problem.
    """
    if value <= zero_below or value >= zero_above:
        return 0.0
    if full_from <= value <= full_to:
        return max_points
    if value < full_from:
        return _linear_points(value, zero_at=zero_below, full_at=full_from, max_points=max_points)
    return _linear_points(value, zero_at=zero_above, full_at=full_to, max_points=max_points)


# --------------------------------------------------------------------------- #
# Pure technical computations
# --------------------------------------------------------------------------- #


def close_series(history: pd.DataFrame) -> pd.Series:
    """The Close column as a clean float series with a sorted date index."""
    if history is None or history.empty or "Close" not in history.columns:
        return pd.Series(dtype="float64")
    series = pd.to_numeric(history["Close"], errors="coerce").dropna()
    return series.sort_index()


def compute_sma(closes: pd.Series, window: int) -> float | None:
    """Simple moving average of the last ``window`` closes, or None if too short.

    A 200-day average computed from 60 observations is not a 200-day average, so
    a short series returns None rather than a shorter mean wearing the same name.
    """
    if len(closes) < window:
        return None
    return float(closes.iloc[-window:].mean())


def compute_rsi(closes: pd.Series, period: int = RSI_PERIOD) -> float | None:
    """Wilder's RSI over the whole series, returning the latest value.

    Wilder's smoothing (not a plain rolling mean) is used because that is what
    every charting package shows; a simple-average RSI would disagree with the
    number the user sees in their broker's platform.
    """
    if len(closes) < period + 1:
        return None

    deltas = closes.diff().dropna()
    gains = deltas.clip(lower=0.0)
    losses = (-deltas).clip(lower=0.0)

    avg_gain = float(gains.iloc[:period].mean())
    avg_loss = float(losses.iloc[:period].mean())
    for gain, loss in zip(gains.iloc[period:], losses.iloc[period:]):
        avg_gain = (avg_gain * (period - 1) + float(gain)) / period
        avg_loss = (avg_loss * (period - 1) + float(loss)) / period

    if avg_loss == 0.0:
        return 100.0 if avg_gain > 0.0 else 50.0
    rs = avg_gain / avg_loss
    return float(100.0 - 100.0 / (1.0 + rs))


def detect_cross_state(closes: pd.Series) -> str:
    """Where the fast average sits relative to the slow one, right now.

    Deliberately reports the *state* (golden / death) rather than hunting for the
    crossing day: a cross that happened four months ago is stale news, but "the
    50 is above the 200" is a fact about today.
    """
    fast = compute_sma(closes, SMA_FAST)
    slow = compute_sma(closes, SMA_SLOW)
    if fast is None or slow is None:
        return "unknown"
    if fast > slow:
        return "golden"
    if fast < slow:
        return "death"
    return "none"


def annualised_volatility(closes: pd.Series) -> float | None:
    """Standard deviation of daily log returns, annualised, in percent."""
    if len(closes) < 2:
        return None
    returns = np.log(closes / closes.shift(1)).dropna()
    if len(returns) < 2:
        return None
    daily = float(returns.std(ddof=1))
    if not math.isfinite(daily):
        return None
    return daily * math.sqrt(TRADING_DAYS_PER_YEAR) * 100.0


def max_drawdown_pct(closes: pd.Series) -> float | None:
    """Worst peak-to-trough fall inside the window, as a negative percentage."""
    if len(closes) < 2:
        return None
    running_peak = closes.cummax()
    drawdowns = closes / running_peak - 1.0
    worst = float(drawdowns.min())
    if not math.isfinite(worst):
        return None
    return worst * 100.0


def trailing_return_pct(closes: pd.Series, trading_days: int) -> float | None:
    """Return over the last ``trading_days`` bars, in percent.

    Counted in bars rather than calendar days because the series only contains
    trading days; asking for 21 bars back is the honest way to say "a month".
    """
    if len(closes) <= trading_days:
        return None
    start = float(closes.iloc[-(trading_days + 1)])
    end = float(closes.iloc[-1])
    if start <= 0:
        return None
    return (end / start - 1.0) * 100.0


def momentum_score_from_returns(returns_pct: list[float | None]) -> float | None:
    """Blends the trailing returns into a 0-100 reading.

    Mapping is deliberately simple and stated here so the number is reproducible
    by hand: ``50 + average_return * 1.25``, clipped. An average trailing return
    of +40 % scores 100, -40 % scores 0, flat scores 50.
    """
    available = [value for value in returns_pct if value is not None]
    if not available:
        return None
    average = sum(available) / len(available)
    return max(0.0, min(100.0, 50.0 + average * 1.25))


def downsample_history(closes: pd.Series, max_points: int = MAX_HISTORY_POINTS) -> list[PricePoint]:
    """Evenly thins the series for the chart, always keeping the newest point."""
    if closes.empty:
        return []
    if len(closes) <= max_points:
        selected = closes
    else:
        indices = np.linspace(0, len(closes) - 1, max_points).round().astype(int)
        selected = closes.iloc[np.unique(indices)]
    return [
        PricePoint(date=_index_to_iso(stamp), close=float(value))
        for stamp, value in selected.items()
    ]


def _index_to_iso(stamp) -> str:
    try:
        return pd.Timestamp(stamp).date().isoformat()
    except (ValueError, TypeError):
        return str(stamp)


def compute_technicals(history: pd.DataFrame, *, max_points: int = MAX_HISTORY_POINTS) -> Technicals:
    """Everything derivable from the price series alone."""
    closes = close_series(history)
    result = Technicals(observations=len(closes))
    if closes.empty:
        return result

    result.points = downsample_history(closes, max_points)
    result.first_date = _index_to_iso(closes.index[0])
    result.last_date = _index_to_iso(closes.index[-1])

    price = float(closes.iloc[-1])
    result.sma50 = compute_sma(closes, SMA_FAST)
    result.sma200 = compute_sma(closes, SMA_SLOW)
    result.above_sma50 = None if result.sma50 is None else price > result.sma50
    result.above_sma200 = None if result.sma200 is None else price > result.sma200

    result.cross_state = detect_cross_state(closes)
    result.cross_state_cs = {
        "golden": "zlatý kříž (SMA50 nad SMA200)",
        "death": "kříž smrti (SMA50 pod SMA200)",
        "none": "SMA50 a SMA200 se protínají",
        "unknown": "neurčeno (krátká historie)",
    }[result.cross_state]

    result.rsi14 = compute_rsi(closes)
    result.volatility_annual_pct = annualised_volatility(closes)
    result.max_drawdown_pct = max_drawdown_pct(closes)

    result.return_1m_pct = trailing_return_pct(closes, 21)
    result.return_3m_pct = trailing_return_pct(closes, 63)
    result.return_6m_pct = trailing_return_pct(closes, 126)
    result.return_1y_pct = trailing_return_pct(closes, TRADING_DAYS_PER_YEAR)
    result.momentum_score = momentum_score_from_returns(
        [result.return_1m_pct, result.return_3m_pct, result.return_6m_pct, result.return_1y_pct]
    )
    return result


# --------------------------------------------------------------------------- #
# Projection
# --------------------------------------------------------------------------- #


def project_prices(
    closes: pd.Series,
    *,
    horizon_days: int = TRADING_DAYS_PER_YEAR,
    paths: int = PROJECTION_PATHS,
    seed: int = PROJECTION_SEED,
) -> Projection | None:
    """Monte Carlo terminal-price distribution from the historical log returns.

    Drift and volatility are the sample mean and sample standard deviation of the
    daily log returns in the lookback window — no opinion is added. Because the
    sum of ``horizon_days`` independent normal draws is itself normal, the paths
    are drawn directly at the horizon instead of stepped day by day; the terminal
    distribution is identical and the work is one draw per path.

    The generator is seeded, so the same input always produces the same numbers.
    A projection that moved every time the user pressed refresh would look like
    an opinion changing its mind.
    """
    if len(closes) < 30:
        return None

    returns = np.log(closes / closes.shift(1)).dropna()
    returns = returns[np.isfinite(returns)]
    if len(returns) < 30:
        return None

    drift = float(returns.mean())
    volatility = float(returns.std(ddof=1))
    start_price = float(closes.iloc[-1])
    if not math.isfinite(drift) or not math.isfinite(volatility) or start_price <= 0:
        return None

    rng = np.random.default_rng(seed)
    shocks = rng.standard_normal(paths)
    log_terminal = drift * horizon_days + volatility * math.sqrt(horizon_days) * shocks
    terminal = start_price * np.exp(log_terminal)

    p5, p25, median, p75, p95 = (
        float(value) for value in np.percentile(terminal, [5, 25, 50, 75, 95])
    )
    return Projection(
        horizon_days=horizon_days,
        paths=paths,
        seed=seed,
        observations=len(returns),
        drift_daily=drift,
        volatility_daily=volatility,
        start_price=start_price,
        p5=p5,
        p25=p25,
        median=median,
        p75=p75,
        p95=p95,
        expected_return_pct=float(terminal.mean() / start_price - 1.0) * 100.0,
        probability_below_current_pct=float((terminal < start_price).mean()) * 100.0,
    )


# --------------------------------------------------------------------------- #
# Scoring
# --------------------------------------------------------------------------- #


def _finalise_subscore(
    key: str,
    label: str,
    raw_factors: list[ScoreFactor],
    total_possible: float,
) -> SubScore:
    """Rescales the available factors so their points literally sum to the score.

    Two things have to be true at once for the breakdown to be honest: the score
    must be comparable across tickers (0-100 regardless of how much data was
    found), and the visible factor points must add up to it. So the available
    factors are rescaled onto a 100-point base, and ``coverage`` records how much
    of the intended factor set that base was actually built from.
    """
    weight = SUBSCORE_WEIGHTS[key]
    available_max = sum(factor.max_points for factor in raw_factors)
    coverage = (available_max / total_possible) if total_possible else 0.0

    if not raw_factors or available_max <= 0:
        return SubScore(
            key=key,
            label=label,
            score=None,
            weight=weight,
            coverage=0.0,
            factors=[],
            unavailable_reason="Chybí vstupní data pro tuto část hodnocení.",
        )

    scale = 100.0 / available_max
    scaled = [
        ScoreFactor(
            key=factor.key,
            label=factor.label,
            value=factor.value,
            unit=factor.unit,
            points=round(factor.points * scale, 2),
            max_points=round(factor.max_points * scale, 2),
            explanation=factor.explanation,
        )
        for factor in raw_factors
    ]
    return SubScore(
        key=key,
        label=label,
        score=round(sum(factor.points for factor in scaled), 2),
        weight=weight,
        coverage=round(coverage, 3),
        factors=scaled,
    )


def score_valuation(fundamentals: Fundamentals) -> SubScore:
    """Is the price demanding? Cheap multiples score high, rich ones score low."""
    factors: list[ScoreFactor] = []
    total_possible = 25.0 + 15.0 + 20.0 + 15.0 + 15.0 + 10.0

    if fundamentals.trailing_pe is not None and fundamentals.trailing_pe > 0:
        points = _linear_points(fundamentals.trailing_pe, zero_at=40.0, full_at=10.0, max_points=25.0)
        factors.append(ScoreFactor(
            key="trailing_pe",
            label="P/E (trailing)",
            value=fundamentals.trailing_pe,
            unit="x",
            points=points,
            max_points=25.0,
            explanation=(
                f"Trh platí {_fmt(fundamentals.trailing_pe, 1)}× roční zisk. "
                "Body klesají lineárně mezi P/E 10 (plný počet) a 40 (nula)."
            ),
        ))

    if fundamentals.forward_pe is not None and fundamentals.forward_pe > 0:
        points = _linear_points(fundamentals.forward_pe, zero_at=35.0, full_at=8.0, max_points=15.0)
        factors.append(ScoreFactor(
            key="forward_pe",
            label="P/E (forward)",
            value=fundamentals.forward_pe,
            unit="x",
            points=points,
            max_points=15.0,
            explanation=(
                f"Očekávané P/E {_fmt(fundamentals.forward_pe, 1)}× proti trailing hodnotě "
                "ukazuje, zda trh počítá s růstem zisku."
            ),
        ))

    if fundamentals.peg is not None and fundamentals.peg > 0:
        points = _linear_points(fundamentals.peg, zero_at=3.0, full_at=0.5, max_points=20.0)
        factors.append(ScoreFactor(
            key="peg",
            label="PEG",
            value=fundamentals.peg,
            unit="x",
            points=points,
            max_points=20.0,
            explanation=(
                f"PEG {_fmt(fundamentals.peg)} dává ocenění do poměru k růstu zisku. "
                "Pod 1 znamená, že se za růst neplatí prémie."
            ),
        ))

    if fundamentals.price_to_book is not None and fundamentals.price_to_book > 0:
        points = _linear_points(fundamentals.price_to_book, zero_at=8.0, full_at=1.0, max_points=15.0)
        factors.append(ScoreFactor(
            key="price_to_book",
            label="P/B",
            value=fundamentals.price_to_book,
            unit="x",
            points=points,
            max_points=15.0,
            explanation=(
                f"Cena je {_fmt(fundamentals.price_to_book)}× účetní hodnota. "
                "U firem bez velkého hmotného majetku je tento ukazatel málo vypovídající."
            ),
        ))

    if fundamentals.ev_to_ebitda is not None and fundamentals.ev_to_ebitda > 0:
        points = _linear_points(fundamentals.ev_to_ebitda, zero_at=25.0, full_at=6.0, max_points=15.0)
        factors.append(ScoreFactor(
            key="ev_to_ebitda",
            label="EV/EBITDA",
            value=fundamentals.ev_to_ebitda,
            unit="x",
            points=points,
            max_points=15.0,
            explanation=(
                f"EV/EBITDA {_fmt(fundamentals.ev_to_ebitda, 1)} zahrnuje i dluh, "
                "takže se srovnává napříč různě zadluženými firmami."
            ),
        ))

    if fundamentals.dividend_yield is not None:
        yield_pct = normalise_dividend_yield(fundamentals.dividend_yield)
        points = _linear_points(yield_pct, zero_at=0.0, full_at=4.0, max_points=10.0)
        factors.append(ScoreFactor(
            key="dividend_yield",
            label="Dividendový výnos",
            value=yield_pct,
            unit="%",
            points=points,
            max_points=10.0,
            explanation=(
                f"Dividendový výnos {_fmt(yield_pct)} %. Plný počet bodů od 4 % výše; "
                "nulová dividenda sama o sobě není problém u růstových firem."
            ),
        ))

    return _finalise_subscore("valuation", "Ocenění", factors, total_possible)


def normalise_dividend_yield(raw: float) -> float:
    """yfinance is inconsistent here, so the value is normalised to percent.

    Older responses give 0.0153 for 1.53 %, newer ones give 1.53. Anything above
    1 is read as already being a percentage — a 100 %+ dividend yield is not a
    thing worth optimising for.
    """
    return raw * 100.0 if raw <= 1.0 else raw


def score_quality(fundamentals: Fundamentals) -> SubScore:
    """Does the business itself earn well and stay solvent?"""
    factors: list[ScoreFactor] = []
    total_possible = 25.0 + 25.0 + 15.0 + 15.0 + 10.0 + 10.0 + 10.0

    if fundamentals.profit_margin is not None:
        margin_pct = fundamentals.profit_margin * 100.0
        points = _linear_points(margin_pct, zero_at=0.0, full_at=20.0, max_points=25.0)
        factors.append(ScoreFactor(
            key="profit_margin",
            label="Čistá marže",
            value=margin_pct,
            unit="%",
            points=points,
            max_points=25.0,
            explanation=(
                f"Z každých 100 jednotek tržeb zůstane {_fmt(margin_pct)} čistého zisku. "
                "Plný počet bodů od 20 % výše."
            ),
        ))

    if fundamentals.roe is not None:
        roe_pct = fundamentals.roe * 100.0
        points = _linear_points(roe_pct, zero_at=0.0, full_at=20.0, max_points=25.0)
        factors.append(ScoreFactor(
            key="roe",
            label="ROE",
            value=roe_pct,
            unit="%",
            points=points,
            max_points=25.0,
            explanation=(
                f"Návratnost vlastního kapitálu {_fmt(roe_pct)} %. "
                "Vysoké ROE tažené vysokým dluhem je třeba číst spolu s D/E."
            ),
        ))

    if fundamentals.revenue_growth is not None:
        growth_pct = fundamentals.revenue_growth * 100.0
        points = _linear_points(growth_pct, zero_at=-5.0, full_at=20.0, max_points=15.0)
        factors.append(ScoreFactor(
            key="revenue_growth",
            label="Růst tržeb",
            value=growth_pct,
            unit="%",
            points=points,
            max_points=15.0,
            explanation=f"Meziroční růst tržeb {_fmt(growth_pct)} %.",
        ))

    if fundamentals.earnings_growth is not None:
        growth_pct = fundamentals.earnings_growth * 100.0
        points = _linear_points(growth_pct, zero_at=-10.0, full_at=25.0, max_points=15.0)
        factors.append(ScoreFactor(
            key="earnings_growth",
            label="Růst zisku",
            value=growth_pct,
            unit="%",
            points=points,
            max_points=15.0,
            explanation=f"Meziroční růst zisku {_fmt(growth_pct)} %.",
        ))

    if fundamentals.debt_to_equity is not None:
        # yfinance reports this as a percentage: 150 means 1.5x equity.
        points = _linear_points(fundamentals.debt_to_equity, zero_at=200.0, full_at=30.0, max_points=10.0)
        factors.append(ScoreFactor(
            key="debt_to_equity",
            label="Dluh / vlastní kapitál",
            value=fundamentals.debt_to_equity,
            unit="%",
            points=points,
            max_points=10.0,
            explanation=(
                f"Dluh tvoří {_fmt(fundamentals.debt_to_equity, 1)} % vlastního kapitálu. "
                "Nad 200 % je zadlužení bez bodů, pod 30 % plný počet."
            ),
        ))

    if fundamentals.current_ratio is not None:
        points = _linear_points(fundamentals.current_ratio, zero_at=0.8, full_at=2.0, max_points=10.0)
        factors.append(ScoreFactor(
            key="current_ratio",
            label="Běžná likvidita",
            value=fundamentals.current_ratio,
            unit="x",
            points=points,
            max_points=10.0,
            explanation=(
                f"Krátkodobá aktiva pokrývají krátkodobé závazky "
                f"{_fmt(fundamentals.current_ratio)}×."
            ),
        ))

    if fundamentals.free_cash_flow is not None:
        positive = fundamentals.free_cash_flow > 0
        factors.append(ScoreFactor(
            key="free_cash_flow",
            label="Volný cash flow",
            value=fundamentals.free_cash_flow,
            unit="",
            points=10.0 if positive else 0.0,
            max_points=10.0,
            explanation=(
                "Firma generuje kladný volný cash flow."
                if positive
                else "Volný cash flow je záporný — firma spotřebovává hotovost."
            ),
        ))

    return _finalise_subscore("quality", "Kvalita a ziskovost", factors, total_possible)


def score_momentum(technicals: Technicals) -> SubScore:
    """What the price itself has been doing, independent of the fundamentals."""
    factors: list[ScoreFactor] = []
    total_possible = 20.0 + 20.0 + 15.0 + 20.0 + 25.0

    if technicals.above_sma50 is not None:
        factors.append(ScoreFactor(
            key="above_sma50",
            label="Cena vs. SMA50",
            value=technicals.sma50,
            unit="",
            points=20.0 if technicals.above_sma50 else 0.0,
            max_points=20.0,
            explanation=(
                f"Cena je {'nad' if technicals.above_sma50 else 'pod'} 50denním průměrem "
                f"({_fmt(technicals.sma50)})."
            ),
        ))

    if technicals.above_sma200 is not None:
        factors.append(ScoreFactor(
            key="above_sma200",
            label="Cena vs. SMA200",
            value=technicals.sma200,
            unit="",
            points=20.0 if technicals.above_sma200 else 0.0,
            max_points=20.0,
            explanation=(
                f"Cena je {'nad' if technicals.above_sma200 else 'pod'} 200denním průměrem "
                f"({_fmt(technicals.sma200)}) — obvyklá dělicí čára mezi dlouhodobým "
                "trendem nahoru a dolů."
            ),
        ))

    if technicals.cross_state != "unknown":
        points = {"golden": 15.0, "none": 7.5, "death": 0.0}[technicals.cross_state]
        factors.append(ScoreFactor(
            key="cross_state",
            label="Vztah klouzavých průměrů",
            value=None,
            unit="",
            points=points,
            max_points=15.0,
            explanation=technicals.cross_state_cs.capitalize() + ".",
        ))

    if technicals.rsi14 is not None:
        points = _plateau_points(
            technicals.rsi14,
            zero_below=25.0,
            full_from=45.0,
            full_to=65.0,
            zero_above=90.0,
            max_points=20.0,
        )
        factors.append(ScoreFactor(
            key="rsi14",
            label="RSI(14)",
            value=technicals.rsi14,
            unit="",
            points=points,
            max_points=20.0,
            explanation=(
                f"RSI {_fmt(technicals.rsi14, 1)}. Plný počet bodů v pásmu 45–65; "
                "nízké i vysoké hodnoty body ubírají, protože obě znamenají vychýlení."
            ),
        ))

    if technicals.return_6m_pct is not None:
        points = _linear_points(technicals.return_6m_pct, zero_at=-20.0, full_at=30.0, max_points=25.0)
        factors.append(ScoreFactor(
            key="return_6m",
            label="Výnos za 6 měsíců",
            value=technicals.return_6m_pct,
            unit="%",
            points=points,
            max_points=25.0,
            explanation=f"Cena se za půl roku změnila o {_fmt(technicals.return_6m_pct)} %.",
        ))

    return _finalise_subscore("momentum", "Moment a technika", factors, total_possible)


def score_consensus(consensus: AnalystConsensus) -> SubScore:
    """What sell-side analysts currently think, and how many of them there are."""
    factors: list[ScoreFactor] = []
    total_possible = 50.0 + 35.0 + 15.0

    recommendation_points = {
        "strong_buy": 50.0,
        "buy": 42.0,
        "outperform": 42.0,
        "hold": 25.0,
        "neutral": 25.0,
        "underperform": 10.0,
        "sell": 5.0,
        "strong_sell": 0.0,
    }
    key = (consensus.recommendation_key or "").lower()
    if key in recommendation_points:
        factors.append(ScoreFactor(
            key="recommendation",
            label="Konsensus analytiků",
            value=None,
            unit="",
            points=recommendation_points[key],
            max_points=50.0,
            explanation=(
                f"Souhrnné hodnocení analytiků: {consensus.recommendation_cs or key}."
            ),
        ))

    if consensus.implied_upside_pct is not None:
        points = _linear_points(consensus.implied_upside_pct, zero_at=-10.0, full_at=30.0, max_points=35.0)
        factors.append(ScoreFactor(
            key="implied_upside",
            label="Prostor k cílové ceně",
            value=consensus.implied_upside_pct,
            unit="%",
            points=points,
            max_points=35.0,
            explanation=(
                f"Průměrná cílová cena {_fmt(consensus.target_mean)} leží "
                f"{_fmt(consensus.implied_upside_pct)} % od aktuální ceny."
            ),
        ))

    if consensus.analyst_count is not None:
        points = _linear_points(float(consensus.analyst_count), zero_at=0.0, full_at=15.0, max_points=15.0)
        factors.append(ScoreFactor(
            key="analyst_count",
            label="Šíře pokrytí",
            value=float(consensus.analyst_count),
            unit="",
            points=points,
            max_points=15.0,
            explanation=(
                f"Titul sleduje {consensus.analyst_count} analytiků. "
                "Konsensus dvou lidí váží méně než konsensus dvaceti."
            ),
        ))

    return _finalise_subscore("consensus", "Konsensus analytiků", factors, total_possible)


def verdict_for_score(score: float | None) -> tuple[str, str]:
    """Maps the composite onto a Czech band and a one-line explanation.

    The bands describe the company as the numbers show it. None of them tells the
    user to do anything — this app assesses, it does not instruct.
    """
    if score is None:
        return (
            "Nedostatek dat",
            "Nepodařilo se získat dost údajů na to, aby souhrnné hodnocení něco znamenalo.",
        )
    if score >= 75:
        return (
            "Silné fundamenty",
            "Ocenění, ziskovost i cenový vývoj vycházejí shodně příznivě.",
        )
    if score >= 60:
        return (
            "Spíše příznivé",
            "Většina sledovaných ukazatelů vychází dobře, některé zaostávají.",
        )
    if score >= 45:
        return (
            "Neutrální",
            "Silné a slabé stránky se v datech přibližně vyrovnávají.",
        )
    if score >= 30:
        return (
            "Spíše rizikové",
            "Několik klíčových ukazatelů vychází slabě; hodí se vědět proč.",
        )
    return (
        "Slabé",
        "Ukazatele vycházejí shodně nepříznivě napříč oceněním, kvalitou i momentem.",
    )


def _confidence_label(confidence: float) -> str:
    if confidence >= 0.8:
        return "vysoká"
    if confidence >= 0.55:
        return "střední"
    if confidence >= 0.3:
        return "nízká"
    return "velmi nízká"


def build_assessment(
    fundamentals: Fundamentals,
    technicals: Technicals,
    consensus: AnalystConsensus,
    missing_inputs: list[str] | None = None,
) -> Assessment:
    """Composite of the four sub-scores, weighted over whichever ones exist.

    A sub-score that could not be computed is dropped and the remaining weights
    are renormalised, so a stock with no analyst coverage is not silently
    penalised for it. That is what ``confidence`` is for instead: it falls as
    coverage falls, which is a statement about the analysis rather than about the
    company.
    """
    subscores = [
        score_valuation(fundamentals),
        score_quality(fundamentals),
        score_momentum(technicals),
        score_consensus(consensus),
    ]

    scored = [sub for sub in subscores if sub.score is not None]
    total_weight = sum(sub.weight for sub in scored)
    composite = (
        round(sum(sub.score * sub.weight for sub in scored) / total_weight, 2)
        if total_weight > 0
        else None
    )

    # Confidence is coverage-weighted across all four sub-scores, including the
    # ones that produced nothing at all (they contribute zero coverage).
    confidence = round(
        sum(sub.coverage * sub.weight for sub in subscores) / sum(SUBSCORE_WEIGHTS.values()), 3
    )

    # A composite built from a quarter of the intended inputs is arithmetic, not
    # an assessment. Calling it "Silné fundamenty" when no fundamental was
    # actually read would be the exact black box this layer exists to avoid.
    if composite is not None and confidence < MIN_CONFIDENCE_FOR_VERDICT:
        verdict = "Nedostatek dat"
        detail = (
            f"Podařilo se získat jen {confidence * 100:.0f} % očekávaných vstupů, "
            "takže souhrnné hodnocení není vypovídající. Dílčí skóre níže platí "
            "pro to, co spočítat šlo."
        )
    else:
        verdict, detail = verdict_for_score(composite)

    return Assessment(
        score=composite,
        verdict=verdict,
        verdict_detail=detail,
        confidence=confidence,
        confidence_label=_confidence_label(confidence),
        subscores=subscores,
        missing_inputs=list(missing_inputs or []),
    )


# --------------------------------------------------------------------------- #
# Building the plain-data parts from a yfinance info dict
# --------------------------------------------------------------------------- #


def build_quote(ticker: str, info: dict, technicals: Technicals) -> Quote:
    """Identity and current price, preferring the info dict, falling back to history.

    The last close from the history is used only when the quote fields are
    missing, and it is a real observed close — not an estimate.
    """
    info = info or {}
    price = (
        _clean(info.get("currentPrice"))
        or _clean(info.get("regularMarketPrice"))
        or (technicals.points[-1].close if technicals.points else None)
    )
    previous_close = _clean(info.get("previousClose")) or _clean(
        info.get("regularMarketPreviousClose")
    )

    day_change = None
    if price is not None and previous_close not in (None, 0):
        day_change = (price / previous_close - 1.0) * 100.0

    high = _clean(info.get("fiftyTwoWeekHigh"))
    low = _clean(info.get("fiftyTwoWeekLow"))
    position = None
    if price is not None and high is not None and low is not None and high > low:
        position = max(0.0, min(1.0, (price - low) / (high - low)))

    return Quote(
        ticker=ticker,
        name=info.get("longName") or info.get("shortName") or None,
        exchange=info.get("fullExchangeName") or info.get("exchange") or None,
        currency=info.get("currency") or None,
        sector=info.get("sector") or None,
        industry=info.get("industry") or None,
        price=price,
        previous_close=previous_close,
        day_change_pct=day_change,
        week52_high=high,
        week52_low=low,
        position_in_52w_range=position,
    )


def build_fundamentals(info: dict) -> Fundamentals:
    """Straight read of the info dict, plus a handful of ratios yfinance does
    not already compute, derived from those same fields."""
    info = info or {}
    trailing_pe = _clean(info.get("trailingPE"))
    market_cap = _clean(info.get("marketCap"))
    free_cash_flow = _clean(info.get("freeCashflow"))
    enterprise_value = _clean(info.get("enterpriseValue"))

    ev_to_fcf = (
        enterprise_value / free_cash_flow
        if enterprise_value is not None and free_cash_flow and free_cash_flow > 0
        else None
    )
    fcf_yield = (
        free_cash_flow / market_cap * 100.0
        if free_cash_flow is not None and market_cap
        else None
    )
    earnings_yield = 100.0 / trailing_pe if trailing_pe and trailing_pe > 0 else None

    return Fundamentals(
        market_cap=market_cap,
        trailing_pe=trailing_pe,
        forward_pe=_clean(info.get("forwardPE")),
        peg=_clean(info.get("trailingPegRatio")) or _clean(info.get("pegRatio")),
        price_to_book=_clean(info.get("priceToBook")),
        price_to_sales=_clean(info.get("priceToSalesTrailing12Months")),
        ev_to_ebitda=_clean(info.get("enterpriseToEbitda")),
        ev_to_fcf=ev_to_fcf,
        profit_margin=_clean(info.get("profitMargins")),
        roe=_clean(info.get("returnOnEquity")),
        roa=_clean(info.get("returnOnAssets")),
        revenue_growth=_clean(info.get("revenueGrowth")),
        earnings_growth=_clean(info.get("earningsGrowth"))
        or _clean(info.get("earningsQuarterlyGrowth")),
        debt_to_equity=_clean(info.get("debtToEquity")),
        current_ratio=_clean(info.get("currentRatio")),
        free_cash_flow=free_cash_flow,
        fcf_yield=fcf_yield,
        earnings_yield=earnings_yield,
        dividend_yield=_clean(info.get("dividendYield")),
        payout_ratio=_clean(info.get("payoutRatio")),
        beta=_clean(info.get("beta")),
    )


def build_consensus(info: dict, targets: dict | None, price: float | None) -> AnalystConsensus:
    """Analyst view, taking the dedicated targets endpoint over the info dict.

    ``analyst_price_targets`` is the more reliable of the two when it works, but
    it is also the more likely to be empty, so the info dict stays as fallback.
    """
    info = info or {}
    targets = targets or {}

    key = info.get("recommendationKey") or None
    count = _clean(info.get("numberOfAnalystOpinions"))
    mean = _clean(targets.get("mean")) or _clean(info.get("targetMeanPrice"))
    high = _clean(targets.get("high")) or _clean(info.get("targetHighPrice"))
    low = _clean(targets.get("low")) or _clean(info.get("targetLowPrice"))

    upside = None
    if mean is not None and price not in (None, 0):
        upside = (mean / price - 1.0) * 100.0

    return AnalystConsensus(
        recommendation_key=key,
        recommendation_cs=RECOMMENDATION_LABELS_CS.get((key or "").lower()) if key else None,
        analyst_count=int(count) if count is not None else None,
        target_mean=mean,
        target_high=high,
        target_low=low,
        implied_upside_pct=upside,
    )


# --------------------------------------------------------------------------- #
# I/O — yfinance
# --------------------------------------------------------------------------- #


def resolve_symbol(ticker: str, exchange: str = "") -> str:
    """Appends the Yahoo suffix for the venue, when one is known.

    An unknown exchange returns the bare ticker: a wrong suffix fetches a
    different company's prices, which is worse than fetching nothing.
    """
    symbol = (ticker or "").strip().upper()
    if not symbol or "." in symbol:
        return symbol
    suffix = EXCHANGE_SUFFIXES.get((exchange or "").strip().upper())
    return f"{symbol}{suffix}" if suffix else symbol


def _fetch_history(symbol: str, lookback_days: int) -> pd.DataFrame | None:
    try:
        import yfinance

        history = yfinance.Ticker(symbol).history(
            period=f"{max(lookback_days, 30)}d", auto_adjust=True
        )
    except Exception:
        return None
    if history is None or history.empty:
        return None
    return history


def _fetch_info(symbol: str) -> dict:
    try:
        import yfinance

        info = yfinance.Ticker(symbol).info
    except Exception:
        return {}
    return info if isinstance(info, dict) else {}


def _fetch_price_targets(symbol: str) -> dict:
    try:
        import yfinance

        targets = yfinance.Ticker(symbol).analyst_price_targets
    except Exception:
        return {}
    return targets if isinstance(targets, dict) else {}


# --------------------------------------------------------------------------- #
# I/O — optional written commentary
# --------------------------------------------------------------------------- #

NARRATIVE_TIMEOUT_SECONDS = 20.0
NARRATIVE_MAX_TOKENS = 1200
ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

NARRATIVE_ABSENT_NOTE = (
    "Slovní komentář není k dispozici (není nastaven přístup k jazykovému modelu). "
    "Kvantitativní analýza výše je úplná a stojí sama o sobě."
)
NARRATIVE_FAILED_NOTE = (
    "Slovní komentář se nepodařilo vygenerovat. Kvantitativní analýza výše "
    "je tím nedotčená."
)


def _narrative_context(analysis_parts: dict) -> str:
    """The computed numbers, handed to the model as JSON so it cannot invent any."""
    return (
        "Zde jsou spočítaná data. Nepřidávej žádná další čísla:\n\n"
        + json.dumps(analysis_parts, ensure_ascii=False, indent=2)
    )


def generate_narrative(analysis_parts: dict) -> Narrative:
    """Optional written commentary. Never allowed to break the response.

    Everything about this call is defensive: no key means no call at all, the
    timeout is short, and any exception at all collapses to a Narrative with
    ``generated=False``. The quantitative analysis is the product; this is a
    garnish, and a garnish must not be able to take down the plate.
    """
    if not config.ANTHROPIC_API_KEY:
        return Narrative(text=None, model=None, generated=False, note=NARRATIVE_ABSENT_NOTE)

    try:
        import httpx

        response = httpx.post(
            ANTHROPIC_MESSAGES_URL,
            headers={
                "x-api-key": config.ANTHROPIC_API_KEY,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            json={
                "model": config.ANTHROPIC_MODEL,
                "max_tokens": NARRATIVE_MAX_TOKENS,
                "system": NARRATIVE_SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": _narrative_context(analysis_parts)}],
            },
            timeout=NARRATIVE_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        text = "".join(
            block.get("text", "")
            for block in payload.get("content", [])
            if block.get("type") == "text"
        ).strip()
    except Exception:
        return Narrative(text=None, model=None, generated=False, note=NARRATIVE_FAILED_NOTE)

    if not text:
        return Narrative(text=None, model=None, generated=False, note=NARRATIVE_FAILED_NOTE)
    return Narrative(
        text=text,
        model=config.ANTHROPIC_MODEL,
        generated=True,
        note="Komentář napsal jazykový model na základě čísel výše. Čísla samotná model nepočítal.",
    )


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #


def analyze_ticker(
    ticker: str,
    *,
    exchange: str = "",
    lookback_days: int = 730,
    horizon_days: int = TRADING_DAYS_PER_YEAR,
) -> TickerAnalysis:
    """Full analysis of one ticker: fetch what is available, compute the rest.

    Raises :class:`AnalysisUnavailable` only when the price history is missing —
    that is the one input nothing else can be built without. Every other failure
    leaves a ``None`` and an entry in ``missing_data``.
    """
    symbol = resolve_symbol(ticker, exchange)
    if not symbol:
        raise AnalysisUnavailable("Nebyl zadán žádný ticker.")

    history = _fetch_history(symbol, lookback_days)
    if history is None:
        raise AnalysisUnavailable(
            f"Pro ticker {symbol} se nepodařilo načíst historii cen. "
            "Zkontroluj symbol a burzu, případně to zkus za chvíli znovu."
        )

    missing_data: list[str] = []

    technicals = compute_technicals(history)
    missing_data.extend(technicals.missing_fields())

    info = _fetch_info(symbol)
    if not info:
        missing_data.append("fundamentální data (nepodařilo se načíst)")

    quote = build_quote(symbol, info, technicals)
    missing_data.extend(quote.missing_fields())

    fundamentals = build_fundamentals(info)
    missing_data.extend(fundamentals.missing_fields())

    targets = _fetch_price_targets(symbol)
    consensus = build_consensus(info, targets, quote.price)
    missing_data.extend(consensus.missing_fields())

    projection = project_prices(close_series(history), horizon_days=horizon_days)
    if projection is None:
        missing_data.append("projekce (příliš krátká historie cen)")

    assessment = build_assessment(fundamentals, technicals, consensus, missing_data)

    narrative = generate_narrative(
        {
            "ticker": symbol,
            "quote": _jsonable(asdict(quote)),
            "fundamentals": _jsonable(asdict(fundamentals)),
            "technicals": _jsonable(
                {key: value for key, value in asdict(technicals).items() if key != "points"}
            ),
            "projection": _jsonable(asdict(projection)) if projection else None,
            "consensus": _jsonable(asdict(consensus)),
            "assessment": _jsonable(asdict(assessment)),
            "missing_data": missing_data,
        }
    )

    return TickerAnalysis(
        ticker=ticker,
        resolved_symbol=symbol,
        generated_at=datetime.now(timezone.utc).isoformat(),
        lookback_days=lookback_days,
        horizon_days=horizon_days,
        quote=quote,
        fundamentals=fundamentals,
        technicals=technicals,
        projection=projection,
        consensus=consensus,
        assessment=assessment,
        narrative=narrative,
        missing_data=missing_data,
    )


# --------------------------------------------------------------------------- #
# Serialisation
# --------------------------------------------------------------------------- #


def _jsonable(value):
    """Recursively converts to plain JSON types, mapping NaN and inf to None.

    numpy scalars and NaN both survive ``dataclasses.asdict`` untouched and both
    break ``json.dumps`` (or, worse, produce the non-standard literal ``NaN``
    that browsers refuse to parse), so the conversion happens here rather than
    being left to the API layer.
    """
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (bool, str)) or value is None:
        return value
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, np.bool_):
        return bool(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def to_dict(analysis: TickerAnalysis) -> dict:
    """JSON-serialisable view of the analysis, ready to be returned by the router."""
    return _jsonable(asdict(analysis))
