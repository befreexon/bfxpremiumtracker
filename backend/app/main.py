"""BFX Portfolio Pro API.

Three layers sit on top of one another:

* **Portfolio** — what I own, and what it has actually earned. Lot-level FIFO,
  currency decomposition, XIRR, the holding-period test.
* **Watchlist** — what I want to own, and the price at which I would buy it.
* **AI analýza** — a single instrument put under a lens.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS, SEED_DEMO_ACCOUNT
from app.db import SessionLocal, init_db
from app.seed import seed_demo_account
from app.routers import (
    alerts,
    auth,
    imports,
    markets,
    net_worth,
    notes,
    overview,
    portfolios,
    prices,
    quant,
    rebalance,
    segments,
    snapshots,
    tax_loss,
    transactions,
    watchlist,
)

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    if SEED_DEMO_ACCOUNT:
        db = SessionLocal()
        try:
            seed_demo_account(db)
        except Exception:  # a broken seed must never block the app from starting
            logging.getLogger(__name__).exception("Nepodařilo se založit demo účet.")
        finally:
            db.close()
    yield


app = FastAPI(
    title="BFX Portfolio Pro API",
    description="Evidence portfolia, watchlist a analýza jednotlivých titulů.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(portfolios.router)
app.include_router(overview.router)
app.include_router(prices.router)
app.include_router(imports.router)
app.include_router(watchlist.router)
app.include_router(snapshots.router)
app.include_router(quant.router)
app.include_router(segments.router)
app.include_router(transactions.router)
app.include_router(notes.router)
app.include_router(markets.router)
app.include_router(alerts.router)
app.include_router(rebalance.router)
app.include_router(tax_loss.router)
app.include_router(net_worth.router)

try:
    from app.routers import ai

    app.include_router(ai.router)
except ImportError:  # pragma: no cover - the layer is optional
    logging.getLogger(__name__).warning("Vrstva AI analýzy není k dispozici.")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
