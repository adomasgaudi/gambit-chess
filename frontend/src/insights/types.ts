/**
 * One row of the exported game history.
 *
 * Written by scripts/parse_lichess_pgn.py into src/data/games.ts. Everything is
 * from the exported player's side: `color` is the colour they had, `score` is
 * their result, `elo` is their rating going in.
 */

export type Speed = 'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence'

/** How the game finished, as far as a PGN without clocks can tell. */
export type Ending = 'mate' | 'resign' | 'time' | 'draw'

export interface GameRecord {
  /** Lichess game id — https://lichess.org/<id>. */
  id: string
  /** UTC date, YYYY-MM-DD. */
  date: string
  /** UTC time of day, HH:MM. */
  time: string
  speed: Speed
  /** The PGN clock, e.g. `300+3`, or `-` for correspondence. */
  clock: string
  rated: boolean
  color: 'w' | 'b'
  /** 1 win, 0.5 draw, 0 loss. */
  score: number
  end: Ending
  /** Rating going into the game; null when the account was unrated. */
  elo: number | null
  oppElo: number | null
  opp: string
  /** Rating change, when the game was rated. */
  diff: number | null
  plies: number
  /** The opening moves in SAN, enough for the book to name the line. */
  moves: string[]
}

export const SPEEDS: Speed[] = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence']

export const SPEED_LABELS: Record<Speed, string> = {
  ultraBullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Correspondence',
}

export const ENDING_LABELS: Record<Ending, string> = {
  mate: 'Checkmate',
  resign: 'Resignation',
  time: 'Flag',
  draw: 'Draw',
}
