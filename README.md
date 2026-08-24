# BFX Portfolio Pro

A portfolio analytics dashboard: performance metrics, benchmark comparison, Monte Carlo
simulation, and mean-variance optimization — styled in the **BFX Premium Design** system
(near-black canvas, warm gold accent, pill buttons, no drop shadows).

The analytics are powered by [`engineer-investor-portfolio`](https://github.com/engineerinvestor/Portfolio-Analysis),
an open-source portfolio analysis library. This project wraps it in a FastAPI backend and a
React frontend, instead of the library's own Streamlit app.

## Structure

```
backend/    FastAPI service — wraps engineer-investor-portfolio into a JSON API
frontend/   React + Vite app — BFX Premium Design components and dashboard pages
```

## Running it

### Option A: Docker Compose (recommended)

```bash
docker compose up --build
```

Open http://localhost:5173. Editing files under `backend/app` or `frontend/src` reloads
live (backend via `uvicorn --reload`, frontend via Vite HMR) — no rebuild needed.

### Option B: run each half directly

**Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api/*` to `http://localhost:8000`.

Either way, the backend needs outbound internet access — it fetches live prices from Yahoo
Finance via `yfinance`.

## What it does

- **Performance** — annual return, volatility, Sharpe/Sortino ratio, max drawdown, equity
  curve, allocation breakdown.
- **Benchmark** — alpha, beta, tracking error, information ratio, correlation, up/down
  capture vs. a chosen benchmark (SPY, VTI, BND, …).
- **Monte Carlo** — simulate future portfolio paths from historical return distributions,
  with percentile bands and probability of loss.
- **Optimize** — maximum Sharpe, minimum volatility, or risk parity portfolios, compared
  against your current weights.

Start from a preset (Three-Fund, 60/40, All-Weather, Golden Butterfly, …), enter your own
tickers and weights, or **import a CSV** — click "Import CSV" on the builder screen, or
download the template first (`frontend/public/portfolio-template.csv`):

```csv
ticker,weight
VTI,0.4
VXUS,0.2
BND,0.4
```

The `weight` column accepts either fractions (`0.4`) or percentages (`40` or `40%`) — it's
auto-detected from the column total. Column names `symbol`/`allocation`/`pct`/`%` are also
recognized as aliases for `ticker`/`weight`.

## Design system

`frontend/src/design/` contains the BFX Premium Design tokens (`tokens/`) and components
(`components/`) — Button, Card, Badge, Tag, Input, Select, Checkbox, Switch, Tabs, Dialog.
Fonts are Bricolage Grotesque (display) and Source Sans 3 (body), loaded via Google Fonts.

## Disclaimer

Not investment advice. Educational tool only — see the upstream
[Portfolio-Analysis](https://github.com/engineerinvestor/Portfolio-Analysis) project for the
same disclaimer.
