/**
 * How long a human-like opponent should appear to think.
 *
 * Maia answers in about a millisecond: its human-likeness is entirely in the
 * policy head, so there is no search to spend time on. That makes it play like
 * a human who has already decided every move in advance, which is the one
 * unhuman thing left about it — and it means its clock never moves.
 *
 * This models the delay instead. Three things drive real move times:
 *
 *   opening       book moves come out fast, then times jump at the first
 *                 position the player hasn't seen before
 *   complexity    more legal moves, more to look at
 *   time pressure a player never spends a third of their remaining clock on
 *                 one move, and moves near-instantly once the flag is close
 *
 * The jitter is log-normal, which is roughly how human move times actually
 * distribute: mostly quick, with an occasional long think.
 */

export type Pace = 'fast' | 'human' | 'slow'

export const PACE_LABELS: Record<Pace, string> = {
  fast: 'Fast',
  human: 'Human',
  slow: 'Slow',
}

// Fast is a sub-second delay: at a three-minute budget the base spend is about
// 0.6s, and time pressure can cut it to the 220ms floor. Human and slow are
// scaled against the clock, as before.
const PACE_FACTOR: Record<Pace, number> = { fast: 0.15, human: 1, slow: 2.2 }

/**
 * Clock an untimed game pretends to have, so one model covers both cases. It
 * never decays — nothing is being spent — so this is directly a choice of
 * average pace: three minutes puts it at about four seconds a move.
 */
const UNTIMED_BUDGET_MS = 3 * 60 * 1000

export interface ThinkContext {
  pace: Pace
  /** Engine's remaining clock, or null in an untimed game. */
  remainingMs: number | null
  /** Plies played so far — how deep into the game we are. */
  ply: number
  /** Legal moves in the position. */
  legalMoves: number
}

function gaussian(): number {
  // Box-Muller. Math.random() can return 0, which would make the log diverge.
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function thinkingDelayMs({ pace, remainingMs, ply, legalMoves }: ThinkContext): number {
  const factor = PACE_FACTOR[pace]

  const clock = remainingMs ?? UNTIMED_BUDGET_MS

  // Spend a forty-fifth of the remaining clock per move. Because it is a share
  // of what's *left*, the spend decays geometrically and the clock is never
  // actually run out — and one constant covers bullet through classical:
  // 60s → ~1.3s a move, 180s → ~4s, 300s → ~6.7s, which is about what humans
  // at those time controls really do.
  let ms = (clock / 45) * factor

  // The first few moves are memorised, not calculated.
  if (ply < 6) ms *= 0.25
  else if (ply < 12) ms *= 0.55

  // Cramped positions decide themselves; open ones don't.
  ms *= Math.min(1.6, Math.max(0.6, legalMoves / 30))

  ms *= Math.exp(gaussian() * 0.45)

  // Time trouble: below a minute, thinking collapses towards pre-moving.
  if (remainingMs !== null && remainingMs < 60_000) {
    ms *= Math.max(0.08, remainingMs / 60_000)
  }

  const floor = 220
  // Long thinks are realistic but tedious to sit through, and no human burns a
  // fifth of their remaining clock on one move.
  const hardCap = pace === 'slow' ? 25_000 : 15_000
  const ceiling = remainingMs === null ? hardCap : Math.min(hardCap, remainingMs * 0.2)
  return Math.round(Math.min(Math.max(ms, floor), Math.max(floor, ceiling)))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
