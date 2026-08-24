"""BFX Portfolio Pro API — a thin FastAPI layer over engineer-investor-portfolio."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.analysis import AnalysisError, analyze_portfolio, compare_benchmark, optimize_portfolio, run_monte_carlo
from app.schemas import (
    AnalyzeResponse,
    BenchmarkRequest,
    BenchmarkResponse,
    MonteCarloRequest,
    MonteCarloResponse,
    OptimizeRequest,
    OptimizeResponse,
    PortfolioRequest,
)

app = FastAPI(
    title="BFX Portfolio Pro API",
    description="Portfolio performance, benchmark, Monte Carlo, and optimization analytics.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/portfolio/analyze", response_model=AnalyzeResponse)
def analyze(req: PortfolioRequest) -> AnalyzeResponse:
    try:
        return analyze_portfolio(req)
    except AnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/portfolio/benchmark", response_model=BenchmarkResponse)
def benchmark(req: BenchmarkRequest) -> BenchmarkResponse:
    try:
        return compare_benchmark(req)
    except AnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/portfolio/monte-carlo", response_model=MonteCarloResponse)
def monte_carlo(req: MonteCarloRequest) -> MonteCarloResponse:
    try:
        return run_monte_carlo(req)
    except AnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/portfolio/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest) -> OptimizeResponse:
    try:
        return optimize_portfolio(req)
    except AnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
