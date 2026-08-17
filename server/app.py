"""HTTP front door for the Maia engine.

Maia runs through lc0, which is a native binary. Everything here is stateless
apart from the pool of warm lc0 processes.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from maia_engine import RATINGS, EngineError, MaiaPool

pool = MaiaPool()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    pool.shutdown()


app = FastAPI(title="Maia engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class MoveRequest(BaseModel):
    fen: str
    moves: list[str] = Field(default_factory=list)
    rating: int = 1500
    # Maia imitates humans through its policy head alone; more than one node
    # starts turning it back into a (much stronger) Leela.
    nodes: int = 1


class EvaluationRequest(BaseModel):
    fen: str
    moves: list[str] = Field(default_factory=list)
    # How many policy moves each band should return.
    top: int = Field(default=5, ge=1, le=20)


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "engine": "maia (lc0)",
        "available": pool.available_ratings(),
        "loaded": pool.loaded_ratings(),
    }


@app.get("/api/maia/levels")
def levels() -> dict:
    return {"ratings": pool.available_ratings(), "all": RATINGS}


@app.post("/api/maia/move")
def maia_move(req: MoveRequest) -> dict:
    try:
        engine = pool.get(req.rating)
        return engine.bestmove(req.fen, req.moves, req.nodes)
    except EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/maia/evaluate")
def maia_evaluate(req: EvaluationRequest) -> dict:
    try:
        return {"evaluations": pool.evaluate_all(req.fen, req.moves, req.top)}
    except EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
