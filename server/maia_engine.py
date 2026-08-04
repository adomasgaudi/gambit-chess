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
from dataclasses import dataclass, field
from pathlib import Path

RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]

ROOT = Path(__file__).resolve().parent.parent
LC0_EXE = ROOT / "engines" / "lc0" / "lc0.exe"
WEIGHTS_DIR = ROOT / "engines" / "maia"

# lc0 prints a banner and a pile of load messages before it ever answers; every
# read loop below is bounded by a sentinel line rather than by line count.
STARTUP_TIMEOUT = 60.0
MOVE_TIMEOUT = 30.0


class EngineError(RuntimeError):
    pass


def weights_path(rating: int) -> Path:
    return WEIGHTS_DIR / f"maia-{rating}.pb.gz"


@dataclass
class MaiaProcess:
    rating: int
    proc: subprocess.Popen = field(init=False)
    lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    def __post_init__(self) -> None:
        if not LC0_EXE.exists():
            raise EngineError(f"lc0 not found at {LC0_EXE}")
        weights = weights_path(self.rating)
        if not weights.exists():
            raise EngineError(f"Maia weights not found at {weights}")

        self.proc = subprocess.Popen(
            [
                str(LC0_EXE),
                f"--weights={weights}",
                "--backend=blas",
                "--minibatch-size=1",
                "--threads=1",
                # Silence per-move stats so stdout stays cheap to parse.
                "--verbose-move-stats=false",
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
        self._send("setoption name VerboseMoveStats value false")
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

    def bestmove(self, fen: str, moves: list[str], nodes: int = 1) -> dict:
        with self.lock:
            position = f"position fen {fen}"
            if moves:
                position += " moves " + " ".join(moves)
            self._send(position)
            self._send(f"go nodes {max(1, nodes)}")
            lines = self._read_until("bestmove", MOVE_TIMEOUT)

        best = ""
        ponder = ""
        for line in reversed(lines):
            if line.startswith("bestmove"):
                parts = line.split()
                best = parts[1] if len(parts) > 1 else ""
                if len(parts) > 3 and parts[2] == "ponder":
                    ponder = parts[3]
                break
        if not best or best == "(none)":
            raise EngineError(f"lc0 returned no move for {fen}")
        return {"bestmove": best, "ponder": ponder, "rating": self.rating}

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
            engine = MaiaProcess(rating)
            self._engines[rating] = engine
            return engine

    def available_ratings(self) -> list[int]:
        return [r for r in RATINGS if weights_path(r).exists()]

    def loaded_ratings(self) -> list[int]:
        return sorted(r for r, e in self._engines.items() if e.proc.poll() is None)

    def shutdown(self) -> None:
        with self._lock:
            for engine in self._engines.values():
                engine.close()
            self._engines.clear()
