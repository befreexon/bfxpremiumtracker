"""Sector/industry/country classification: cached like a price, but for much
longer, and never fetched when the caller says not to."""

from datetime import datetime, timedelta, timezone

import pytest

from app.db import Base
from app.models import InstrumentInfo
from app.services.classification import Classification, get_classifications


@pytest.fixture()
def db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def test_a_fresh_cache_entry_is_used_without_fetching(db, monkeypatch):
    db.add(
        InstrumentInfo(
            instrument_key="AAPL|NASDAQ|USD", sector="Technology", industry="Consumer Electronics",
            country="United States", fetched_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    monkeypatch.setattr(
        "app.services.classification._fetch_one",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not fetch")),
    )

    result = get_classifications(db, [("AAPL", "NASDAQ", "USD", "STOCK")], allow_fetch=True)

    assert result["AAPL|NASDAQ|USD"].sector == "Technology"


def test_a_stale_entry_is_refetched_when_allowed(db, monkeypatch):
    db.add(
        InstrumentInfo(
            instrument_key="AAPL|NASDAQ|USD", sector="Old sector",
            fetched_at=datetime.now(timezone.utc) - timedelta(days=90),
        )
    )
    db.commit()
    monkeypatch.setattr(
        "app.services.classification._fetch_one",
        lambda ticker, exchange, asset_class: Classification(sector="Technology", industry=None, country=None),
    )

    result = get_classifications(db, [("AAPL", "NASDAQ", "USD", "STOCK")], allow_fetch=True)

    assert result["AAPL|NASDAQ|USD"].sector == "Technology"


def test_a_missing_entry_is_skipped_rather_than_fetched_when_not_allowed(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.classification._fetch_one",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not fetch")),
    )

    result = get_classifications(db, [("AAPL", "NASDAQ", "USD", "STOCK")], allow_fetch=False)

    assert result == {}


def test_a_failed_lookup_stays_none_rather_than_a_guess(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.classification._fetch_one",
        lambda ticker, exchange, asset_class: Classification(sector=None, industry=None, country=None),
    )

    result = get_classifications(db, [("XYZ", "NASDAQ", "USD", "STOCK")], allow_fetch=True)

    assert result["XYZ|NASDAQ|USD"].sector is None
