"""Turn a Lichess PGN export into the dataset the Insights page reads.

    python scripts/parse_lichess_pgn.py lichess_megachonk_2026-08-04.pgn

Writes frontend/src/data/games.ts: one record per game, seen from the exported
player's side. The player is whoever appears in every game, so the export
doesn't have to be named.

Only what a dashboard can honestly show is kept. There are no clock comments or
evaluations in a plain export, so nothing here pretends to know time spent or
move quality. Openings are not stored either -- the page names them with the
book the app already ships, from the first plies kept here.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "src" / "data" / "games.ts"

# How many plies each record keeps: enough for the opening book's longest line.
OPENING_PLIES = 16

TAG = re.compile(r'^\[([A-Za-z0-9]+)\s+"(.*)"\]$')
# Strip move numbers, comments, variations and NAGs; keep the SAN tokens.
MOVE_NUMBER = re.compile(r"\d+\.(\.\.)?")
COMMENT = re.compile(r"\{[^}]*\}")
NAG = re.compile(r"\$\d+")


def games(text: str):
    """Yield (tags, movetext) for each game in a PGN file."""
    tags: dict[str, str] = {}
    moves: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        match = TAG.match(line)
        if match:
            # A tag line after movetext means the next game has started.
            if moves:
                yield tags, " ".join(moves)
                tags, moves = {}, []
            tags[match.group(1)] = match.group(2)
        elif line:
            moves.append(line)
    if tags:
        yield tags, " ".join(moves)


def san_moves(movetext: str) -> list[str]:
    text = COMMENT.sub(" ", movetext)
    text = NAG.sub(" ", text)
    text = MOVE_NUMBER.sub(" ", text)
    out = []
    for token in text.split():
        if token in ("1-0", "0-1", "1/2-1/2", "*") or token.startswith(("(", ")")):
            continue
        out.append(token)
    return out


def speed_of(event: str, time_control: str) -> str:
    """Lichess puts the speed in the event name; fall back to the clock."""
    for name in ("ultraBullet", "bullet", "blitz", "rapid", "classical", "correspondence"):
        if name.lower() in event.lower():
            return name
    if time_control == "-":
        return "correspondence"
    base, _, inc = time_control.partition("+")
    estimate = int(base) + 40 * int(inc or 0)
    if estimate < 30:
        return "ultraBullet"
    if estimate < 180:
        return "bullet"
    if estimate < 480:
        return "blitz"
    if estimate < 1500:
        return "rapid"
    return "classical"


def termination_of(tags: dict[str, str], moves: list[str], won: bool | None) -> str:
    """How the game ended, as far as a plain export can tell.

    A PGN without clocks can't separate a draw by agreement from one by
    repetition, and a stalemate needs a board to detect, so every draw is just
    "draw". Decisive games split three ways: mate is visible in the last move,
    a time forfeit is tagged, and what remains is a resignation.
    """
    if won is None:
        return "draw"
    if moves and moves[-1].endswith("#"):
        return "mate"
    if tags.get("Termination") == "Time forfeit":
        return "time"
    return "resign"


def elo(value: str | None) -> int | None:
    """Casual games against a provisional account carry "?" instead of a number."""
    return int(value) if value and value.isdigit() else None


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    source = Path(sys.argv[1])
    text = source.read_text(encoding="utf-8-sig")

    parsed = list(games(text))
    if not parsed:
        print(f"no games found in {source}")
        return 1

    # The exported player is in every game; opponents are not.
    seen = Counter()
    for tags, _ in parsed:
        seen[tags["White"]] += 1
        seen[tags["Black"]] += 1
    player, count = seen.most_common(1)[0]
    if count != len(parsed):
        print(f"no single player in all {len(parsed)} games (best: {player}, {count})")
        return 1

    records = []
    for tags, movetext in parsed:
        moves = san_moves(movetext)
        white = tags["White"] == player
        result = tags["Result"]
        score = 0.5 if result == "1/2-1/2" else float(result.startswith("1-0") == white)
        won = None if score == 0.5 else score == 1
        me, opp = ("White", "Black") if white else ("Black", "White")
        diff = tags.get(f"{me}RatingDiff")

        records.append(
            {
                "id": tags.get("GameId", ""),
                "date": tags["UTCDate"].replace(".", "-"),
                "time": tags["UTCTime"][:5],
                "speed": speed_of(tags["Event"], tags["TimeControl"]),
                "clock": tags["TimeControl"],
                "rated": tags["Event"].startswith("rated"),
                "color": "w" if white else "b",
                "score": score,
                "end": termination_of(tags, moves, won),
                "elo": elo(tags.get(f"{me}Elo")),
                "oppElo": elo(tags.get(f"{opp}Elo")),
                "opp": tags[opp],
                "diff": int(diff) if diff else None,
                "plies": len(moves),
                "moves": moves[:OPENING_PLIES],
            }
        )

    # Oldest first: everything on the page reads left to right in time.
    records.sort(key=lambda r: (r["date"], r["time"]))

    body = ",\n".join("  " + json.dumps(r, separators=(",", ":")) for r in records)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "/**\n"
        f" * {len(records)} games played by {player}, from a Lichess PGN export.\n"
        " *\n"
        " * Generated by scripts/parse_lichess_pgn.py -- do not edit by hand.\n"
        f" * Source: {source.name}\n"
        " */\n\n"
        "import type { GameRecord } from '../insights/types'\n\n"
        f"export const PLAYER = '{player}'\n\n"
        f"export const GAMES: GameRecord[] = [\n{body},\n]\n",
        encoding="utf-8",
    )
    print(f"{len(records)} games -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
