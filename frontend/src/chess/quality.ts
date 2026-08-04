/**
 * Move-quality annotation.
 *
 * The rule is lichess's: judge a move by how much win probability it threw
 * away, not by centipawns. Losing 100cp when you're already winning by a queen
 * barely matters; losing 100cp from equality is a real mistake.
 */

import type { Score } from '../engines/types'

export type MoveQuality = 'brilliant' | 'great' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export const QUALITY_META: Record<MoveQuality, { glyph: string; label: string; color: string }> = {
  brilliant: { glyph: '!!', label: 'Brilliant', color: '#21c2a6' },
  great: { glyph: '!', label: 'Great move', color: '#5b9ad6' },
  best: { glyph: '★', label: 'Best move', color: '#8ab4f8' },
  good: { glyph: '', label: 'Good', color: '#9aa0a6' },
  inaccuracy: { glyph: '?!', label: 'Inaccuracy', color: '#f2c14e' },
  mistake: { glyph: '?', label: 'Mistake', color: '#e8912a' },
  blunder: { glyph: '??', label: 'Blunder', color: '#e0524a' },
}

/** Win probability for the side to move, on the same curve as the eval bar. */
export function winProbability(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 1 : 0
  return 1 / (1 + Math.exp(-(score.cp ?? 0) / 350))
}

/**
 * Compare the position before a move with the position after it, both scored
 * from the mover's point of view, and name the drop.
 *
 * @param before score before the move, from the mover's point of view
 * @param after  score after the move, from the mover's point of view
 * @param wasBest whether the move played was the engine's first choice
 */
export function classifyMove(before: Score, after: Score, wasBest: boolean): MoveQuality {
  const lost = winProbability(before) - winProbability(after)

  if (wasBest) {
    // A best move that also wins material or mate out of a level position is
    // the only thing here worth calling brilliant.
    const gained = winProbability(after) - winProbability(before)
    if (gained > 0.2 && winProbability(before) < 0.75) return 'brilliant'
    return 'best'
  }
  if (lost >= 0.3) return 'blunder'
  if (lost >= 0.15) return 'mistake'
  if (lost >= 0.07) return 'inaccuracy'
  if (lost <= 0.02) return 'great'
  return 'good'
}

/** Flip a score so it reads from `color`'s point of view. */
export function fromPov(score: Score, scoreTurn: 'w' | 'b', color: 'w' | 'b'): Score {
  const sign = scoreTurn === color ? 1 : -1
  return {
    cp: score.cp === undefined ? undefined : score.cp * sign,
    mate: score.mate === undefined ? undefined : score.mate * sign,
  }
}
