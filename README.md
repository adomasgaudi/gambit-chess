# Gambit

A lichess-style chess app you run locally, with two very different engines
behind the board:

- **Stockfish 18** — WebAssembly, runs entirely in the browser tab. Plays the
  strongest move it can find; capping its Elo makes it weaker, not human.
- **Maia** — the [CSSLab Maia](https://maiachess.com) networks, one per rating
  band from 1100 to 1900, running through `lc0` at a single node. Maia predicts
  the move a human of that rating would actually play, blunders and all.

Stockfish needs nothing but the browser. Maia needs the small Python server in
`server/`, because lc0 is a native binary.

## Layout

```text
frontend/        Vite + React + TypeScript app
  public/engine/   Stockfish 18 WASM (lite + single-threaded fallback)
  public/piece/    cburnett piece SVGs
  src/chess/       rules, move quality, openings, SAN helpers
  src/engines/     Stockfish UCI worker client, Maia HTTP client
  src/components/  board, panels, setup, analysis
server/          FastAPI wrapper around lc0 + Maia
engines/lc0/     lc0 v0.32.1 (Windows CPU build)
engines/maia/    maia-1100 … maia-1900 weights
```

## Running it

Two processes. The Vite dev server proxies `/api` to the Python one, so the
browser only ever talks to `localhost:5173`.

```bash
# terminal 1 — Maia
python server/app.py

# terminal 2 — the app
cd frontend && npm run dev
```

Then open http://localhost:5173. On Windows, `start.ps1` launches both.

Playing Stockfish works without the Python server running; the **Maia** pill in
the top bar turns red when it isn't reachable.

## Features

**Landing page** — the app opens on a chooser: Stockfish, Maia, two players, or
the analysis board. The three play modes hand off to the options panel beside
the board with that opponent already selected, so strength, colour and time
control are still yours to set; the analysis board has nothing to configure and
opens straight away with the engine running. The Maia card carries a live dot
for whether its server is answering. Clicking the wordmark in the top bar goes
back, and offers to resume a game left in progress.

**Play** — Stockfish at nine strength levels, Maia at nine rating levels, or two
players at one board. Clocks with increment (bullet through classical, or
untimed), drag-and-drop and click-to-move, legal-move dots, check and last-move
highlights, promotion picker, takeback, resign, flip, sound, PGN and FEN export.

**Engine settings** (the ⚙ beside *Engine eval*) — number of lines (1–5), search
depth (12 to unlimited), and threads. The stats row under it shows the depth,
node count and nodes/second the number on screen actually came from.

**Rank one piece's moves.** Click a piece with the engine on and the lines
become that piece's options, best first, instead of the position's — Stockfish's
`searchmoves`, one line per candidate. The panel says which piece it's ranking.
Deselect to go back to the whole position. Focused searches skip the cloud,
which can only answer about the position as a whole.

**Defenders overlay.** A badge on every occupied square counting the friendly
pieces that defend it, green when nothing attacks it, amber when something does,
red when the attackers outnumber the defenders. It counts bodies, not value: two
pawns defending a queen reads "2", which is the number you want when working out
whether a capture leaves you a piece down, and says nothing about the trade
being good.

**Analysis** — live eval bar and the top three engine lines, hover a line to see
its first move as an arrow, opening names from a built-in ECO book, and
**Review game**, which walks the whole game and annotates each move
`!!` / `!` / `★` / `?!` / `?` / `??` by how much win probability it gave away.

Both consult [Lichess cloud eval](https://lichess.org/api#tag/Analysis) before
the local engine, and say `cloud` in the stats row when the number on screen
came from there.

Every move that cost something also gets a second mark saying *what kind* of
mistake it was — `⚔` tactical, `≈` positional — with the reasoning in the
tooltip. See below.

Each engine line is labelled with the opening it transposes into, when that
differs from the one the game is already in — from the start position the lines
name themselves as the English, the Ruy López, the Réti and so on.

Keyboard: `←` `→` step, `↑` `↓` jump to start/end, `f` flips the board.

**Why Maia is made to think.** Maia's move comes out of a single policy
evaluation in about a millisecond, so left alone it answers instantly and its
clock never moves — the one inhuman thing left about an engine built to be
human. `src/chess/thinkTime.ts` models the delay instead: a share of the
*remaining* clock per move, so the spend decays geometrically and it can never
flag; quartered while the opening is still book; scaled by how many legal moves
there are; log-normal jitter, which is roughly how human move times really
distribute; and collapsing towards pre-moving under a minute. One constant
covers every time control — 60s gives ~1.3s a move, 300s ~6.7s. Set it to
Instant in the options panel to get the old behaviour back.

## Notes on the engines

**Why Maia searches one node.** Maia's human-likeness lives entirely in its
policy head. Give lc0 more nodes and search starts correcting the network's
human mistakes, which is exactly the behaviour Maia exists to avoid. The server
hard-floors `nodes` at 1 and the client never asks for more.

**Cross-origin isolation.** The threaded Stockfish build needs
`SharedArrayBuffer`, which browsers only grant cross-origin-isolated pages. The
Vite config sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`
for both `dev` and `preview`; if you serve `dist/` some other way and don't set
those headers, the app silently falls back to the single-threaded build.

**Two Stockfish workers.** One plays the opponent, one drives the eval bar and
review. Sharing a single worker would mean the analysis and the opponent
fighting over the same search.

**Why analysis asks Lichess first.** In the opening, a tab-sized Stockfish is
badly outclassed: it reaches depth 20 off two million nodes, while Lichess has
the start position cached at depth 65 off 593 million. So `src/engines/cloud.ts`
looks the position up before searching, and on a hit the local engine never
runs. A 404 is the useful answer too — it means the game has left analysed
territory, which is exactly when the local search starts being worth doing.

This only changes how positions are *judged*. Neither opponent picks its moves
this way: Maia's whole point is that she plays like a human of her rating, and
feeding her a depth-65 line would destroy that.

The API is free, unauthenticated and CORS-open, so the browser calls it
directly — no key, and nothing to run. Results and misses are both cached per
FEN for the session, calls are serialised 60ms apart, and a 429 mutes cloud
lookups for a minute. Offline, every lookup misses and the app behaves exactly
as it did before. Review stops asking after four misses in a row, since
positions only get rarer as a game goes on.

**Tactical or strategic.** An eval says how much a move cost, never what it
cost it to, because a single number is a verdict with the timeline already
collapsed out of it. `src/chess/nature.ts` recovers the missing half from three
things sitting around the number, all of which the search already produces:

```text
material   the books at the end of the refutation, not ply by ply — mid-
           combination the balance lurches every move, and the leaf is the
           one point where it has settled
forcing    captures, checks and promotions in the first six plies
horizon    the verdict at every depth on the way to the last one; the engine
           reports it whether or not anyone keeps it
```

Nature and horizon cross into the four things that actually go wrong:

```text
                     forced or concrete?
                     no                    yes
  shallow sees it    positional            loses material
  needs deep         strategic             combination
```

Material can't be the only test, which three real positions show: the Fried
Liver leaves Black *two pawns up* through the whole refutation and completely
lost; Damiano nets to level material because the pawn comes straight back; and
an ordinary quiet French has Black a pawn up mid-line while the eval says Black
is worse. `forcing` catches the first two, and only a swing *against* the mover
counts, which handles the third. On those cases plus a level Berlin, a main-line
Ruy and a QGD Exchange, the rule is 7 for 7.

The horizon axis is unavailable for cloud-evaluated positions — the API returns
one settled depth, not the climb to it — so opening mistakes get a nature but
no difficulty.

## Licences

lc0 and Stockfish are GPL-3.0. The Maia weights are from
[CSSLab/maia-chess](https://github.com/CSSLab/maia-chess). The piece set is
cburnett, from [lichess-org/lila](https://github.com/lichess-org/lila), GPL-2.0.
