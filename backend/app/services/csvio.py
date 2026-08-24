"""CSV import and export.

Import runs as preview then commit, never writing straight from the file. The
preview marks every row green, amber or red, and an import may be run with bad
rows present — they are simply left out.

Czech Excel writes semicolons and often decimal commas, so both are detected
rather than demanded from the user.
"""

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.engine import fifo
from app.engine.currency import (
    KNOWN_CURRENCIES,
    interpret_user_fx,
    is_minor_unit,
    major_currency,
    normalize_currency_code,
)
from app.engine.fifo import TxInput
from app.models import Portfolio, Transaction, User

COLUMNS = [
    "typ", "datum", "ticker", "burza", "trida", "mnozstvi", "cena", "mena",
    "poplatek", "kurz_czk", "isin", "nazev", "portfolio", "poznamka",
]
REQUIRED_COLUMNS = {"typ", "datum", "ticker", "burza", "trida", "mnozstvi", "cena", "mena"}

VALID_TYPES = {"BUY", "SELL", "DIV", "ADJUST"}
VALID_CLASSES = {"STOCK", "ETF", "CRYPTO"}

STATUS_OK = "ok"
STATUS_WARNING = "warning"
STATUS_ERROR = "error"
STATUS_DUPLICATE = "duplicate"


@dataclass
class ParsedRow:
    line_number: int
    status: str = STATUS_OK
    messages: list[str] = field(default_factory=list)
    data: dict | None = None
    raw: dict = field(default_factory=dict)

    def fail(self, message: str) -> None:
        self.status = STATUS_ERROR
        self.messages.append(message)

    def warn(self, message: str) -> None:
        if self.status == STATUS_OK:
            self.status = STATUS_WARNING
        self.messages.append(message)


@dataclass
class ImportPreview:
    delimiter: str = ","
    rows: list[ParsedRow] = field(default_factory=list)
    fatal_error: str | None = None
    new_portfolios: list[str] = field(default_factory=list)

    @property
    def counts(self) -> dict[str, int]:
        summary = {STATUS_OK: 0, STATUS_WARNING: 0, STATUS_ERROR: 0, STATUS_DUPLICATE: 0}
        for row in self.rows:
            summary[row.status] = summary.get(row.status, 0) + 1
        return summary

    @property
    def importable(self) -> list[ParsedRow]:
        return [r for r in self.rows if r.status in (STATUS_OK, STATUS_WARNING) and r.data]


def sniff_delimiter(text: str) -> str:
    """Semicolon or comma, decided on the header line."""
    first_line = text.lstrip("﻿").splitlines()[0] if text.strip() else ""
    return ";" if first_line.count(";") > first_line.count(",") else ","


def _parse_number(value: str, *, delimiter: str) -> float | None:
    """Reads a number, tolerating a decimal comma when the file is semicolon-separated."""
    if value is None:
        return None
    cleaned = str(value).strip().replace(" ", "").replace(" ", "")
    if not cleaned:
        return None
    if delimiter == ";" and "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_date(value: str) -> date | None:
    raw = (value or "").strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _dedupe_key(data: dict) -> tuple:
    return (
        data["type"],
        data["date"],
        data["ticker"],
        round(data["quantity"], 8),
        round(data["price"], 8),
    )


def _major_rate_lookup(db: Session):
    """Cached-only rate lookup, used to sanity-check hand-entered FX rates.

    Deliberately does not hit the network: an import must stay fast and must
    work offline, and a missing reference simply means the check is skipped
    rather than guessed at.
    """
    from app.services import fx as fx_service

    def lookup(currency: str, on: date) -> float | None:
        return fx_service.rate_to_czk(
            db, major_currency(currency), on, allow_fetch=False
        )

    return lookup


def preview_import(
    db: Session,
    user: User,
    text: str,
    *,
    default_portfolio: Portfolio,
    today: date | None = None,
) -> ImportPreview:
    today = today or date.today()
    text = text.lstrip("﻿")
    preview = ImportPreview(delimiter=sniff_delimiter(text))

    reader = csv.DictReader(io.StringIO(text), delimiter=preview.delimiter)
    headers = {(h or "").strip().lower() for h in (reader.fieldnames or [])}

    missing = REQUIRED_COLUMNS - headers
    if missing:
        preview.fatal_error = (
            "Chybí povinné sloupce: " + ", ".join(sorted(missing)) +
            ". Import se nespustil."
        )
        return preview

    existing_portfolios = {
        p.name.strip().lower(): p for p in db.query(Portfolio).filter(Portfolio.user_id == user.id)
    }
    existing_keys = _existing_transaction_keys(db, user)
    seen_in_file: set[tuple] = set()
    # Holdings simulated per portfolio+instrument so an oversized sale is caught.
    running: dict[tuple, list[TxInput]] = {}

    major_rate = _major_rate_lookup(db)

    for offset, raw in enumerate(reader, start=2):
        row = ParsedRow(line_number=offset, raw={k: v for k, v in raw.items() if k})
        data = _parse_row(row, raw, preview.delimiter, today, major_rate)
        if row.status == STATUS_ERROR or data is None:
            preview.rows.append(row)
            continue

        portfolio_name = (raw.get("portfolio") or "").strip() or default_portfolio.name
        data["portfolio_name"] = portfolio_name
        if portfolio_name.strip().lower() not in existing_portfolios:
            if portfolio_name not in preview.new_portfolios:
                preview.new_portfolios.append(portfolio_name)
                row.warn(f"Portfolio „{portfolio_name}“ zatím neexistuje, založí se.")

        key = _dedupe_key(data)
        if key in existing_keys or key in seen_in_file:
            row.status = STATUS_DUPLICATE
            row.messages.append("Stejná transakce už existuje, řádek se přeskočí.")
            preview.rows.append(row)
            continue
        seen_in_file.add(key)

        _check_holdings(row, data, running)

        row.data = data
        preview.rows.append(row)

    return preview


def _parse_row(
    row: ParsedRow, raw: dict, delimiter: str, today: date, major_rate=None
) -> dict | None:
    tx_type = (raw.get("typ") or "").strip().upper()
    if tx_type not in VALID_TYPES:
        row.fail(f"Neznámý typ „{tx_type or '—'}“. Povolené: BUY, SELL, DIV, ADJUST.")
        return None

    when = _parse_date(raw.get("datum", ""))
    if when is None:
        row.fail(f"Datum „{(raw.get('datum') or '').strip()}“ nejde přečíst. Očekává se YYYY-MM-DD.")
        return None
    if when > today:
        row.fail(f"Datum {when.isoformat()} je v budoucnosti.")
        return None

    ticker = (raw.get("ticker") or "").strip().upper()
    if not ticker:
        row.fail("Chybí ticker.")
        return None

    exchange = (raw.get("burza") or "").strip().upper()
    if not exchange:
        row.fail("Chybí burza.")
        return None

    asset_class = (raw.get("trida") or "").strip().upper()
    if asset_class not in VALID_CLASSES:
        row.fail(f"Neznámá třída „{asset_class or '—'}“. Povolené: STOCK, ETF, CRYPTO.")
        return None

    quantity = _parse_number(raw.get("mnozstvi", ""), delimiter=delimiter)
    if quantity is None:
        row.fail("Množství nejde přečíst.")
        return None

    price = _parse_number(raw.get("cena", ""), delimiter=delimiter)
    if price is None:
        row.fail("Cena nejde přečíst.")
        return None

    currency = normalize_currency_code(raw.get("mena", ""))
    if not currency:
        row.fail("Chybí měna.")
        return None
    if currency not in KNOWN_CURRENCIES:
        row.warn(f"Měna {currency} není v seznamu známých měn, kurz se nemusí dohledat.")

    if tx_type == "ADJUST":
        if quantity <= 0:
            row.fail(f"Split s poměrem {quantity:g} je neplatný.")
            return None
        if abs(quantity - 1.0) < 1e-12:
            row.warn("Split s poměrem 1 nic nemění, řádek nebude mít žádný efekt.")
    else:
        if quantity <= 0:
            row.fail("Množství musí být větší než nula.")
            return None
        if price <= 0:
            row.fail("Cena musí být větší než nula.")
            return None

    if tx_type == "DIV" and abs(quantity - 1.0) > 1e-9:
        row.warn("U dividendy se očekává množství 1, do ceny patří hrubá částka celkem.")

    fee = _parse_number(raw.get("poplatek", ""), delimiter=delimiter) or 0.0
    fx_rate = _parse_number(raw.get("kurz_czk", ""), delimiter=delimiter)

    if fx_rate is not None and fx_rate <= 0:
        row.warn("Kurz musí být kladný, bude dohledán automaticky.")
        fx_rate = None
    if fx_rate is not None and is_minor_unit(currency) and major_rate is not None:
        # Someone entering a rate for a pence-quoted line will very likely type
        # the pound rate. Checked against the real fixing where we have it,
        # because the alternative is a position a hundred times too large.
        reference = major_rate(currency, when)
        reading = interpret_user_fx(fx_rate, currency, major_reference=reference)
        if reading.corrected:
            fx_rate = reading.rate
            row.warn(reading.message)

    return {
        "type": tx_type,
        "date": when,
        "ticker": ticker,
        "exchange": exchange,
        "asset_class": asset_class,
        "quantity": quantity,
        "price": price,
        "currency": currency,
        "fee": fee,
        "fx_rate": fx_rate,
        "isin": (raw.get("isin") or "").strip().upper(),
        "name": (raw.get("nazev") or "").strip(),
        "note": (raw.get("poznamka") or "").strip(),
    }


def _check_holdings(row: ParsedRow, data: dict, running: dict[tuple, list[TxInput]]) -> None:
    """Replays the file so far to catch a sale of more than was held."""
    key = (data["portfolio_name"], data["ticker"], data["exchange"], data["currency"])
    history = running.setdefault(key, [])
    candidate = TxInput(
        id=None,
        type=data["type"],
        date=data["date"],
        quantity=data["quantity"],
        price=data["price"],
        currency=data["currency"],
        fee=data["fee"],
        fx_rate=data["fx_rate"] or 1.0,
    )

    if data["type"] == "SELL":
        held = fifo.run(history, strict=False).quantity
        if data["quantity"] - held > 1e-9:
            row.fail(
                f"Prodej {data['quantity']:g} ks, ale k {data['date'].isoformat()} "
                f"je drženo jen {held:g} ks."
            )
            return

    history.append(candidate)


def _existing_transaction_keys(db: Session, user: User) -> set[tuple]:
    rows = (
        db.query(Transaction)
        .join(Portfolio)
        .filter(Portfolio.user_id == user.id)
        .all()
    )
    return {
        (r.type, r.date, r.ticker, round(r.quantity, 8), round(r.price, 8)) for r in rows
    }


def commit_import(
    db: Session, user: User, preview: ImportPreview, default_portfolio: Portfolio
) -> dict:
    """Writes the rows the preview accepted. Rows flagged red are left out."""
    if preview.fatal_error:
        return {"imported": 0, "skipped": len(preview.rows), "created_portfolios": []}

    portfolios = {
        p.name.strip().lower(): p
        for p in db.query(Portfolio).filter(Portfolio.user_id == user.id)
    }
    created: list[str] = []

    for name in preview.new_portfolios:
        if name.strip().lower() in portfolios:
            continue
        portfolio = Portfolio(user_id=user.id, name=name)
        db.add(portfolio)
        db.flush()
        portfolios[name.strip().lower()] = portfolio
        created.append(name)

    imported = 0
    for row in preview.importable:
        data = dict(row.data or {})
        name = data.pop("portfolio_name", default_portfolio.name)
        portfolio = portfolios.get(name.strip().lower(), default_portfolio)
        db.add(Transaction(portfolio_id=portfolio.id, **data))
        imported += 1

    db.commit()
    return {
        "imported": imported,
        "skipped": len(preview.rows) - imported,
        "created_portfolios": created,
    }


def export_csv(db: Session, user: User, portfolio_ids: list[int] | None = None) -> str:
    """Writes the same 14-column format the importer reads.

    Without this the user is a hostage of one database file.
    """
    query = (
        db.query(Transaction, Portfolio.name)
        .join(Portfolio)
        .filter(Portfolio.user_id == user.id)
    )
    if portfolio_ids:
        query = query.filter(Transaction.portfolio_id.in_(portfolio_ids))

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=",", lineterminator="\n")
    writer.writerow(COLUMNS)

    for tx, portfolio_name in query.order_by(Transaction.date, Transaction.id):
        writer.writerow([
            tx.type,
            tx.date.isoformat(),
            tx.ticker,
            tx.exchange,
            tx.asset_class,
            f"{tx.quantity:.8f}".rstrip("0").rstrip("."),
            f"{tx.price:.8f}".rstrip("0").rstrip("."),
            tx.currency,
            f"{tx.fee:g}" if tx.fee else "",
            f"{tx.fx_rate:g}" if tx.fx_rate else "",
            tx.isin or "",
            tx.name or "",
            portfolio_name,
            (tx.note or "").replace("\n", " "),
        ])

    return buffer.getvalue()
