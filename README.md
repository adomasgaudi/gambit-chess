# Gambit

A local chess app built around Maia: human-like move choices at five analysis
bands — 600, 1000, 1500, 2000, and 2500. It does not use Stockfish, cloud
evaluations, or long tactical searches.

Maia runs through `lc0`, so the app needs the small Python server in `server/`
as well as the Vite frontend. Every position asks all five Maia profiles. The
analysis panel toggles between the chosen move's policy probability and a
Maia-derived, pawn-like score from the network's root value.

## Layout

```text
frontend/        Vite + React + TypeScript app
  public/piece/    cburnett piece SVGs
  src/chess/       rules, openings, SAN and game helpers
  src/engines/     Maia HTTP client and score vocabulary
  src/components/  board, panels, setup, Maia evaluations, insights
  src/insights/    counting over an exported game history
  src/data/        games.ts, generated from a Lichess PGN export
server/          FastAPI wrapper around lc0 + Maia
engines/lc0/     lc0 v0.32.1 (Windows CPU build)
engines/maia/    Maia 1100, 1500 and 1900 weights
```

## Running it

```bash
# terminal 1 — Maia
python server/app.py

# terminal 2 — the app
cd frontend && npm run dev
```

Then open http://localhost:5173. On Windows, `start.ps1` launches both.

## Maia profiles

The bundled Maia v1 weights are officially available at 1100–1900. The five
requested display bands stay Maia-only: 600 and 1000 soften the Maia 1100
policy, 1500 uses Maia 1500, and 2000 and 2500 sharpen the Maia 1900 policy.
The UI keeps the requested bands visible while the tooltip identifies the
official network used underneath. No profile searches beyond one lc0 node.

## Features

- Play Maia with selectable colour, time controls, human-like thinking delay,
  takeback, resignation, sound, PGN/FEN export, and board orientation.
- See five Maia evaluations for every position at once.
- Toggle each evaluation between move chance and Maia score.
- See the top natural candidate moves and their policy probabilities.
- Use the Maia 1500 recommendation as the board arrow and evaluation-bar
  reference.
- Explore moves, defenders, attacks, checks, promotion, and opening context.
- Read Insights: your own Lichess history counted — rating per speed over time,
  record by speed, colour and ending, game length against score, score by
  opponent strength, opening families as each colour, and a weekday-by-hour map.

## Insights

The page reads `frontend/src/data/games.ts`, which is generated from a Lichess
PGN export:

```bash
python scripts/parse_lichess_pgn.py lichess_<user>_<date>.pgn
```

The parser takes the exported player to be whoever appears in every game, and
keeps one record per game seen from their side. A plain export has no clock
comments and no evaluations, so the page reports only what the moves and tags
support — nothing about time trouble or blunder rates. Openings are named by the
book in `src/chess/openings.ts` and cut back to the family.

## Why Maia searches one node

Maia's human-likeness lives in its policy head. More lc0 nodes would search
away from the human policy and start correcting the mistakes Maia is meant to
model. The server therefore hard-floors every evaluation at one node.

## Licences

lc0 is GPL-3.0. The Maia weights are from
[CSSLab/maia-chess](https://github.com/CSSLab/maia-chess). The piece set is
cburnett, from [lichess-org/lila](https://github.com/lichess-org/lila), GPL-2.0.
