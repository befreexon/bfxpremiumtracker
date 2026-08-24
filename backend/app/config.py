"""Runtime configuration, all overridable by environment variable."""

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("BFX_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("BFX_DATABASE_URL", f"sqlite:///{DATA_DIR / 'bfx.db'}")

# A generated secret means sessions do not survive a restart. Set BFX_SECRET_KEY
# in any deployment where that matters.
SECRET_KEY = os.getenv("BFX_SECRET_KEY") or secrets.token_urlsafe(48)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = int(os.getenv("BFX_TOKEN_TTL_MINUTES", "20160"))  # 14 days

CORS_ORIGINS = os.getenv(
    "BFX_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

# Optional: enables the written commentary in the AI analysis layer. Without it
# the layer still works — it just returns the quantitative analysis only.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("BFX_ANTHROPIC_MODEL", "claude-sonnet-4-6")

BASE_CURRENCY = "CZK"

# Price cache lifetimes, in seconds.
PRICE_CACHE_TTL = 6 * 60 * 60
PRICE_CACHE_TTL_CRYPTO = 15 * 60
