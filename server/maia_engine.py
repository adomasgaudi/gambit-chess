"""Maia over lc0, spoken as UCI.

Maia is a set of Leela-Chess-Zero networks trained to predict the move a human
of a given rating actually played, rather than the best move. Because the
prediction lives entirely in the policy head, we search exactly one node: any
more and lc0 starts improving on the human it is supposed to imitate.

One long-lived lc0 process is kept per rating level, spawned on first use.
"""

from __future__ import annotations

import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
import re

# The UI presents five human-facing bands. Maia v1 ships official nets from
# 1100 to 1900, so the outer bands stay Maia policy evaluations while using a
# softer/harder policy temperature around the nearest available net.
RATINGS = [600, 1000, 1500, 2000, 2500]

PROFILES: dict[int, tuple[int, float]] = {
    600: (1100, 1.85),
    1000: (1100, 1.48),
    1500: (1500, 1.359),
    2000: (1900, 1.08),
    2500: (1900, 0.82),
}

ROOT = Path(__file__).resolve().parent.parent
LC0_EXE = ROOT / "engines" / "lc0" / "lc0.exe"
WEIGHTS_DIR = ROOT / "engines" / "maia"

# lc0 prints a banner and a pile of load messages before it ever answers; every
# read loop below is bounded by a sentinel line rather than by line count.
STARTUP_TIMEOUT = 60.0
MOVE_TIMEOUT = 30.0
POLICY_RE = re.compile(r"^info string (?P<move>\S+).*?\(P:\s*(?P<prob>[0-9.]+)%\)")
VALUE_RE = re.compile(r"\(V:\s*(?P<value>[+-]?[0-9.]+)\)")


class EngineError(RuntimeError):
    pass


def weights_path(rating: int) -> Path:
    return WEIGHTS_DIR / f"maia-{rating}.pb.gz"


@dataclass
class MaiaProcess:
    rating: int
    model_rating: int
    policy_temperature: float
    proc: subprocess.Popen = field(init=False)
    lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    def __post_init__(self) -> None:
        if not LC0_EXE.exists():
            raise EngineError(f"lc0 not found at {LC0_EXE}")
        weights = weights_path(self.model_rating)
        if not weights.exists():
            raise EngineError(f"Maia weights not found at {weights}")

        self.proc = subprocess.Popen(
            [
                str(LC0_EXE),
                f"--weights={weights}",
                "--backend=blas",
                "--minibatch-size=1",
                "--threads=1",
                "--verbose-move-stats=true",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            cwd=str(ROOT),
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        self._send("uci")
        self._read_until("uciok", STARTUP_TIMEOUT)
        self._send("setoption name VerboseMoveStats value true")
        self._send(f"setoption name PolicyTemperature value {self.policy_temperature}")
        self._send("isready")
        self._read_until("readyok", STARTUP_TIMEOUT)

    # -- raw io ----------------------------------------------------------

    def _send(self, line: str) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(line + "\n")
        self.proc.stdin.flush()

    def _read_until(self, prefix: str, timeout: float) -> list[str]:
        """Collect stdout lines up to and including the first one starting with
        `prefix`. A dead process raises rather than blocking forever."""
        assert self.proc.stdout is not None
        collected: list[str] = []
        deadline = threading.Event()
        timer = threading.Timer(timeout, deadline.set)
        timer.start()
        try:
            while True:
                if deadline.is_set():
                    raise EngineError(f"lc0 timed out waiting for '{prefix}'")
                line = self.proc.stdout.readline()
                if line == "":
                    raise EngineError("lc0 exited unexpectedly")
                line = line.strip()
                if line:
                    collected.append(line)
                if line.startswith(prefix):
                    return collected
        finally:
            timer.cancel()

    # -- api -------------------------------------------------------------

    # How many policy moves a caller may ask for. lc0 lists every legal move,
    # so the ceiling is only there to keep a stray request from filling the panel.
    MAX_CANDIDATES = 20

    def bestmove(self, fen: str, moves: list[str], nodes: int = 1) -> dict:
        result = self.evaluate(fen, moves, nodes)
        return {
            "bestmove": result["bestmove"],
            "ponder": "",
            "rating": self.rating,
            "modelRating": self.model_rating,
            "value": result["value"],
            # The full policy, so the caller can ask "what would Maia think of
            # the move that was actually played here?" without a second query.
            "policy": result["all"],
        }

    def evaluate(self, fen: str, moves: list[str], nodes: int = 1, top: int = 5) -> dict:
        with self.lock:
            position = f"position fen {fen}"
            if moves:
                position += " moves " + " ".join(moves)
            self._send(position)
            self._send(f"go nodes {max(1, nodes)}")
            lines = self._read_until("bestmove", MOVE_TIMEOUT)

        best = ""
        for line in reversed(lines):
            if line.startswith("bestmove"):
                parts = line.split()
                best = parts[1] if len(parts) > 1 else ""
                break
        if not best or best == "(none)":
            raise EngineError(f"lc0 returned no move for {fen}")

        policy: dict[str, float] = {}
        value = 0.0
        for line in lines:
            # lc0's root summary line is shaped exactly like a move line but
            # names "node" instead of a move; it carries the position value.
            if line.startswith("info string node"):
                value_match = VALUE_RE.search(line)
                if value_match:
                    value = float(value_match.group("value"))
                continue
            policy_match = POLICY_RE.match(line)
            if policy_match:
                policy[policy_match.group("move")] = float(policy_match.group("prob")) / 100.0

        wanted = max(1, min(self.MAX_CANDIDATES, top))
        ordered = sorted(policy.items(), key=lambda item: item[1], reverse=True)
        candidates = [
            {"move": move, "probability": probability}
            for move, probability in ordered[:wanted]
        ]
        return {
            "rating": self.rating,
            "modelRating": self.model_rating,
            "bestmove": best,
            "probability": policy.get(best, 0.0),
            "value": value,
            "candidates": candidates,
            # Every legal move, most likely first. The panel uses it for the
            # move count, the worst move, and per-piece move lists; the
            # network only has ~60 moves in the worst case, so the payload is
            # tiny.
            "all": [{"move": move, "probability": probability} for move, probability in ordered],
        }

    def close(self) -> None:
        try:
            self._send("quit")
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


class MaiaPool:
    """Lazily spawns and reuses one lc0 process per rating level."""

    def __init__(self) -> None:
        self._engines: dict[int, MaiaProcess] = {}
        self._lock = threading.Lock()

    def get(self, rating: int) -> MaiaProcess:
        if rating not in RATINGS:
            raise EngineError(f"unknown Maia rating {rating}; pick one of {RATINGS}")
        with self._lock:
            engine = self._engines.get(rating)
            if engine is not None and engine.proc.poll() is None:
                return engine
            model_rating, policy_temperature = PROFILES[rating]
            engine = MaiaProcess(rating, model_rating, policy_temperature)
            self._engines[rating] = engine
            return engine

    def available_ratings(self) -> list[int]:
        return [r for r in RATINGS if weights_path(PROFILES[r][0]).exists()]

    def loaded_ratings(self) -> list[int]:
        return sorted(r for r, e in self._engines.items() if e.proc.poll() is None)

    def shutdown(self) -> None:
        with self._lock:
            for engine in self._engines.values():
                engine.close()
            self._engines.clear()

    def evaluate_all(self, fen: str, moves: list[str], top: int = 5) -> list[dict]:
        """Run all five Maia policy profiles for the same position."""
        with ThreadPoolExecutor(max_workers=len(RATINGS)) as executor:
            futures = {
                rating: executor.submit(self.get(rating).evaluate, fen, moves, 1, top)
                for rating in RATINGS
            }
            return [futures[rating].result() for rating in RATINGS]
