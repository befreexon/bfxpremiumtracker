"""Currency handling, including the minor units that quietly break trackers.

Some venues quote in a hundredth of the currency unit. LSE quotes in pence
(GBX), not pounds; Johannesburg in cents (ZAc); Tel Aviv in agorot (ILA).
Treating GBX as GBP overstates such a position a hundredfold, which then
distorts every portfolio weight and the concentration warning with it. So the
minor units are first-class currencies here, not aliases.

Convention used throughout the engine: an FX rate is always **CZK per one unit
of the quoted currency**. For GBX that is CZK per penny (~0.28), not per pound.
`interpret_user_fx` exists to catch the case where a human types the pound rate
anyway.
"""

from dataclasses import dataclass

BASE_CURRENCY = "CZK"

# quoted currency -> (major currency, how many major units one quoted unit is)
MINOR_UNITS: dict[str, tuple[str, float]] = {
    "GBX": ("GBP", 0.01),
    "GBp": ("GBP", 0.01),
    "ZAC": ("ZAR", 0.01),
    "ZAc": ("ZAR", 0.01),
    "ILA": ("ILS", 0.01),
}

KNOWN_CURRENCIES = {
    "CZK", "USD", "EUR", "GBP", "GBX", "CHF", "PLN", "HUF", "SEK", "NOK",
    "DKK", "CAD", "JPY", "AUD", "ZAR", "ZAC", "ILS", "ILA",
}


def normalize_currency_code(code: str) -> str:
    """Upper-cases a currency code while keeping the minor units distinguishable."""
    cleaned = (code or "").strip()
    if cleaned in MINOR_UNITS:
        return cleaned.upper() if cleaned.upper() in MINOR_UNITS else cleaned
    return cleaned.upper()


def major_currency(currency: str) -> str:
    """The currency an FX table would actually list. GBX -> GBP, USD -> USD."""
    currency = normalize_currency_code(currency)
    if currency in MINOR_UNITS:
        return MINOR_UNITS[currency][0]
    return currency


def minor_factor(currency: str) -> float:
    """How many major units one quoted unit is. GBX -> 0.01, USD -> 1.0."""
    currency = normalize_currency_code(currency)
    if currency in MINOR_UNITS:
        return MINOR_UNITS[currency][1]
    return 1.0


def is_minor_unit(currency: str) -> bool:
    return normalize_currency_code(currency) in MINOR_UNITS


def to_major(amount: float, currency: str) -> tuple[float, str]:
    """Restates an amount from a minor unit into its major currency.

    >>> to_major(1500.0, "GBX")
    (15.0, 'GBP')
    """
    return amount * minor_factor(currency), major_currency(currency)


def quoted_rate_from_major(major_rate: float, currency: str) -> float:
    """Turns a CZK-per-major-unit rate into CZK per quoted unit.

    With GBP at 28.50 CZK, one penny is worth 0.285 CZK.
    """
    return major_rate * minor_factor(currency)


def to_czk(amount: float, currency: str, fx_rate: float | None) -> float | None:
    """Converts an amount in the quoted currency to CZK.

    `fx_rate` is CZK per quoted unit. CZK amounts need no rate. Returns None when
    a rate is required but unknown — never a zero, and never the unconverted
    number, both of which would look like real money downstream.
    """
    currency = normalize_currency_code(currency)
    if currency == BASE_CURRENCY:
        return amount
    if fx_rate is None:
        return None
    return amount * fx_rate


@dataclass(frozen=True)
class FxInterpretation:
    rate: float
    corrected: bool
    message: str = ""


def interpret_user_fx(
    rate: float, currency: str, major_reference: float | None = None
) -> FxInterpretation:
    """Reads a human-supplied FX rate, catching the minor-unit mistake.

    Someone entering a rate for a GBX position will very likely type the pound
    rate (28.50) rather than the penny rate (0.285). If a reference rate for the
    major currency is available and the input sits near it, the input is
    reinterpreted and flagged, because silently accepting it would inflate the
    position a hundredfold.
    """
    currency = normalize_currency_code(currency)
    if not is_minor_unit(currency) or major_reference is None or rate <= 0:
        return FxInterpretation(rate=rate, corrected=False)

    expected = quoted_rate_from_major(major_reference, currency)
    # Near the major rate rather than the quoted one: taken as the major rate.
    if abs(rate - major_reference) < abs(rate - expected):
        return FxInterpretation(
            rate=quoted_rate_from_major(rate, currency),
            corrected=True,
            message=(
                f"Kurz {rate:g} vypadá jako kurz pro {major_currency(currency)}, "
                f"ne pro {currency}. Přepočítáno na {quoted_rate_from_major(rate, currency):g} "
                f"CZK za 1 {currency}."
            ),
        )
    return FxInterpretation(rate=rate, corrected=False)
