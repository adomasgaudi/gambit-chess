/**
 * Telling a tactical mistake from a strategic one.
 *
 * `quality.ts` says how much a move cost. This says what kind of thing it cost
 * it to — the more useful half, because the two failures need different
 * practice. An eval alone can't answer it: a single number is a verdict with
 * the timeline already collapsed out of it. All three signals here come from
 * around the number rather than from it.
 *
 *   material   Walk the refutation to its end and compare the books. Losing a
 *              piece and keeping it lost is as concrete as chess gets.
 *
 *   forcing    Captures, checks and promotions in the opening plies of the
 *              refutation. This is what catches the sacrifices, where material
 *              flows *towards* the player who blundered and the position is
 *              lost anyway — and the quiet lines where nothing is forced and
 *              the punishment is just that every move from here is unpleasant.
 *
 *   horizon    The search reports its verdict at every depth on the way. If
 *              depth 6 already knew, the punishment was inside a human's
 *              horizon and you should have seen it. If nothing under depth 18
 *              saw it, missing it was reasonable.
 *
 * Nature and horizon cross into the four things that actually go wrong:
 *
 *                    forced or concrete?
 *                    no                      yes
 *   shallow sees it  positional              loses material
 *   needs deep       strategic               combination
 *
 * Why material can't be the only test — three real cases it gets wrong alone:
 *
 *   Fried Liver (1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 Nxd5??) leaves
 *   Black two pawns *up* through the refutation and completely lost. Material
 *   moving the blunderer's way is a sacrifice, not an acquittal — `forcing`
 *   catches it at 3 of the first 6 plies.
 *
 *   Damiano (1.e4 e5 2.Nf3 f6??) nets to level material: Nxe5 wins the pawn,
 *   Qxe4+ wins it back. Level books, dead lost position. Again `forcing`.
 *
 *   French Advance with 6...Qb6, an ordinary quiet position, has Black a pawn
 *   up mid-line off an unrecaptured cxd4 while the eval says Black is slightly
 *   *worse*. Material and eval pointing opposite ways is the tell that material
 *   isn't what's happening, so only a swing against the mover counts.
 */

import { Chess, type Square } from 'chess.js'
import type { Score } from '../engines/types'
import { winProbability } from './quality'

export type Nature = 'tactical' | 'positional'
export type Horizon = 'shallow' | 'deep'

export interface Insight {
  nature: Nature
  /** Absent for cloud evaluations, which report one settled depth and no climb. */
  horizon: Horizon | null
  /** Shallowest depth whose verdict matched the final one. */
  settledAt: number | null
  /** Pawns the mover ends the refutation down. Negative is material lost. */
  materialSwing: number
  /** Share of the opening plies that are captures, checks or promotions. */
  forcing: number
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Material loss that counts as something concrete having gone. */
const SWING = 0.9

/** Plies over which "is this forced?" is a fair question. */
const FORCING_WINDOW = 6

/**
 * Forcing share above which a line reads as a combination. A third is one
 * capture or check every other move — below that a line is drifting, not
 * hunting. Calibrated on the cases in the header comment: Damiano's refutation
 * sits at exactly 2/6 and has to land tactical, the quiet French at 1/6 must
 * not.
 */
const FORCING_MIN = 0.33

/** At or below this depth, a club player could have seen it over the board. */
const SHALLOW_MAX = 8

/** Win-probability distance at which two verdicts count as the same verdict. */
const SAME_VERDICT = 0.05

export interface LossContext {
  /** Position after the move being judged. */
  fen: string
  /** Opponent's best line from that position, in UCI. */
  refutation: string[]
  /** Depth → score, side-to-move point of view. Null for cloud evaluations. */
  curve: Map<number, Score> | null
  /** The side that played the move being judged. */
  mover: 'w' | 'b'
}

/**
 * Name what kind of mistake a move was. Call it only for moves that actually
 * lost something — a good move has no loss to characterise.
 */
export function analyseLoss({ fen, refutation, curve, mover }: LossContext): Insight | null {
  if (!refutation.length) return null

  const { swing, forcing } = walk(fen, refutation, mover)
  const { horizon, settledAt } = readHorizon(curve)

  return {
    nature: swing <= -SWING || forcing >= FORCING_MIN ? 'tactical' : 'positional',
    horizon,
    settledAt,
    materialSwing: swing,
    forcing,
  }
}

/**
 * Play the refutation out, and report what it did.
 *
 * Material is read once at the leaf rather than ply by ply. Mid-combination the
 * balance lurches every move as pieces come off, and an even trade would read
 * as material changing hands twice; the leaf is the only point where the books
 * have settled, and it is also where the engine's eval was measured, so the two
 * are directly comparable.
 */
function walk(fen: string, refutation: string[], mover: 'w' | 'b'): { swing: number; forcing: number } {
  const chess = new Chess(fen)
  const start = balance(chess, mover)
  let played = 0
  let forced = 0

  for (const uci of refutation) {
    let move
    try {
      move = chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci[4],
      })
    } catch {
      break
    }
    if (!move) break

    if (played < FORCING_WINDOW) {
      const forcing =
        move.captured !== undefined || move.promotion !== undefined || chess.inCheck()
      if (forcing) forced++
    }
    played++
  }
  if (!played) return { swing: 0, forcing: 0 }

  return {
    swing: balance(chess, mover) - start,
    forcing: forced / Math.min(played, FORCING_WINDOW),
  }
}

/** Material from `mover`'s point of view, in pawns. */
function balance(chess: Chess, mover: 'w' | 'b'): number {
  let total = 0
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square) continue
      total += (square.color === mover ? 1 : -1) * (VALUE[square.type] ?? 0)
    }
  }
  return total
}

/**
 * The shallowest depth that already agreed with the final verdict. Scanning
 * from the deep end backwards and stopping at the first disagreement matters:
 * a shallow search can stumble onto the right number for the wrong reason and
 * wander off again, and what we want is where it stopped changing its mind,
 * not where it first happened to be right.
 */
function readHorizon(curve: Map<number, Score> | null): {
  horizon: Horizon | null
  settledAt: number | null
} {
  if (!curve || curve.size < 2) return { horizon: null, settledAt: null }

  const depths = [...curve.keys()].sort((a, b) => a - b)
  const finalWp = winProbability(curve.get(depths[depths.length - 1])!)

  let settledAt = depths[depths.length - 1]
  for (let i = depths.length - 2; i >= 0; i--) {
    if (Math.abs(winProbability(curve.get(depths[i])!) - finalWp) > SAME_VERDICT) break
    settledAt = depths[i]
  }
  return { horizon: settledAt <= SHALLOW_MAX ? 'shallow' : 'deep', settledAt }
}

/** The two axes as a phrase, for a tooltip. */
export function describeInsight(insight: Insight): string {
  const parts: string[] = []

  if (insight.nature === 'positional') {
    parts.push(insight.horizon === 'deep' ? 'strategic' : 'positional')
    parts.push('nothing forced, material stays level')
  } else if (insight.materialSwing <= -SWING) {
    parts.push(`loses ${Math.abs(insight.materialSwing).toFixed(0)} pawns`)
  } else if (insight.materialSwing >= SWING) {
    parts.push(`sacrifice — up ${insight.materialSwing.toFixed(0)} and lost anyway`)
  } else {
    parts.push('combination')
  }

  if (insight.nature === 'tactical') {
    parts.push(`${Math.round(insight.forcing * 100)}% forcing`)
  }
  if (insight.settledAt !== null) parts.push(`visible at depth ${insight.settledAt}`)
  return parts.join(' · ')
}

export const NATURE_META: Record<Nature, { glyph: string; color: string }> = {
  tactical: { glyph: '⚔', color: '#d08a4e' },
  positional: { glyph: '≈', color: '#6f8fb0' },
}
