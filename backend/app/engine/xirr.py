"""Money-weighted return (XIRR).

A plain percentage misleads as soon as money goes in at different times: money
added just before a rally flatters the number, money added just before a fall
punishes it. XIRR asks instead what constant annual rate would reconcile every
dated cash flow with today's value.

    sum over i of  CF_i / (1 + r) ** (days_i / 365) = 0
"""

from dataclasses import dataclass
from datetime import date

MAX_ITERATIONS = 100
TOLERANCE = 1e-7
INITIAL_GUESS = 0.1
DAYS_PER_YEAR = 365.0


@dataclass(frozen=True)
class CashFlow:
    when: date
    amount: float  # negative = money in, positive = money out or current value


def _npv(rate: float, flows: list[CashFlow], start: date) -> float:
    total = 0.0
    for flow in flows:
        years = (flow.when - start).days / DAYS_PER_YEAR
        total += flow.amount / (1.0 + rate) ** years
    return total


def _npv_derivative(rate: float, flows: list[CashFlow], start: date) -> float:
    total = 0.0
    for flow in flows:
        years = (flow.when - start).days / DAYS_PER_YEAR
        if years == 0:
            continue
        total -= years * flow.amount / (1.0 + rate) ** (years + 1)
    return total


def xirr(flows: list[CashFlow]) -> float | None:
    """Annualised money-weighted return, or None when it cannot be determined.

    Returning None rather than 0.0 on failure is deliberate: a zero would read as
    "you broke even", which is a statement about the portfolio rather than about
    the calculation.
    """
    if len(flows) < 2:
        return None

    ordered = sorted(flows, key=lambda f: f.when)
    start = ordered[0].when

    # Without flows on both sides there is no rate that zeroes the sum.
    if not any(f.amount < 0 for f in ordered) or not any(f.amount > 0 for f in ordered):
        return None

    rate = INITIAL_GUESS
    for _ in range(MAX_ITERATIONS):
        value = _npv(rate, ordered, start)
        if abs(value) < TOLERANCE:
            return rate
        derivative = _npv_derivative(rate, ordered, start)
        if abs(derivative) < 1e-12:
            break
        step = value / derivative
        next_rate = rate - step
        if next_rate <= -0.9999999:  # keep (1 + r) positive
            next_rate = (rate - 0.9999999) / 2.0
        if abs(next_rate - rate) < TOLERANCE:
            return next_rate
        rate = next_rate

    return _bisect(ordered, start)


def _bisect(flows: list[CashFlow], start: date) -> float | None:
    """Fallback for the cases where Newton walks off a cliff.

    Slower but far harder to break, which matters because the alternative is
    showing the user a wrong number rather than a dash.
    """
    low, high = -0.9999, 1000.0
    npv_low = _npv(low, flows, start)
    npv_high = _npv(high, flows, start)
    if npv_low * npv_high > 0:
        return None

    for _ in range(200):
        mid = (low + high) / 2.0
        npv_mid = _npv(mid, flows, start)
        if abs(npv_mid) < TOLERANCE:
            return mid
        if npv_low * npv_mid < 0:
            high, npv_high = mid, npv_mid
        else:
            low, npv_low = mid, npv_mid
    return (low + high) / 2.0
