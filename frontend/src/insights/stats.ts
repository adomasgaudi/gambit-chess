/**
 * Everything the Insights page counts.
 *
 * Pure functions over a list of games, so the page can hand them a filtered
 * list and re-render without any of the numbers going stale. Nothing here
 * touches the DOM and nothing caches — 143 games recount in well under a frame.
 *
 * The one judgement call worth naming: a "record" is wins/draws/losses, and the
 * score it reports is the chess one, (W + D/2) / games, not the win percentage.
 * They differ the moment a draw appears.
 */

import { findOpening } from '../chess/openings'
import { SPEEDS, type Ending, type GameRecord, type Speed } from './types'

export interface Record {
  games: number
  wins: number
  draws: number
  losses: number
  /** (W + D/2) / games, as a percentage. NaN-free: 0 games scores 0. */
  score: number
}

export function record(games: GameRecord[]): Record {
  let wins = 0
  let draws = 0
  for (const game of games) {
    if (game.score === 1) wins++
    else if (game.score === 0.5) draws++
  }
  const losses = games.length - wins - draws
  const score = games.length ? (100 * (wins + draws / 2)) / games.length : 0
  return { games: games.length, wins, draws, losses, score }
}

/** Group games by a key, keeping the order the keys first appear in. */
export function groupBy<K>(games: GameRecord[], key: (game: GameRecord) => K): Map<K, GameRecord[]> {
  const out = new Map<K, GameRecord[]>()
  for (const game of games) {
    const k = key(game)
    const bucket = out.get(k)
    if (bucket) bucket.push(game)
    else out.set(k, [game])
  }
  return out
}

/** A row of a "record by something" chart. */
export interface Split {
  label: string
  record: Record
  games: GameRecord[]
}

export function splitBy<K>(
  games: GameRecord[],
  key: (game: GameRecord) => K,
  label: (key: K) => string,
): Split[] {
  return [...groupBy(games, key)].map(([k, list]) => ({
    label: label(k),
    record: record(list),
    games: list,
  }))
}

// --- Rating ---------------------------------------------------------------

export interface RatingPoint {
  /** Milliseconds since the epoch, the x axis of the rating chart. */
  t: number
  rating: number
}

export interface RatingLine {
  speed: Speed
  points: RatingPoint[]
  /** Highest rating reached, and where. */
  peak: RatingPoint
  latest: RatingPoint
}

export function playedAt(game: GameRecord): number {
  return Date.parse(`${game.date}T${game.time}:00Z`)
}

/**
 * Rating after each rated game, one line per speed.
 *
 * The export stores the rating going *into* the game plus the change, so the
 * rating after it is the sum — that is the number Lichess shows on the profile.
 *
 * A speed with a handful of games is all provisional swing and no trend: five
 * ultraBullet games years apart draw a near-vertical line that reads as a
 * collapse. Below the minimum the speed is left off the chart entirely.
 */
export function ratingLines(games: GameRecord[], minGames = 6): RatingLine[] {
  const lines: RatingLine[] = []
  for (const speed of SPEEDS) {
    const points: RatingPoint[] = []
    for (const game of games) {
      if (game.speed !== speed || !game.rated || game.elo === null || game.diff === null) continue
      points.push({ t: playedAt(game), rating: game.elo + game.diff })
    }
    if (points.length < minGames) continue
    points.sort((a, b) => a.t - b.t)
    const peak = points.reduce((best, p) => (p.rating > best.rating ? p : best), points[0])
    lines.push({ speed, points, peak, latest: points[points.length - 1] })
  }
  return lines
}

// --- Buckets --------------------------------------------------------------

export interface Bucket {
  label: string
  games: GameRecord[]
  record: Record
}

/**
 * Sort games into fixed bands by some number, keeping empty bands.
 *
 * Empty bands matter: a gap in the middle of a histogram is information, and
 * dropping it would silently close the gap up.
 */
export function bucketBy(
  games: GameRecord[],
  value: (game: GameRecord) => number | null,
  edges: number[],
  label: (low: number, high: number, index: number) => string,
): Bucket[] {
  const buckets: Bucket[] = edges.slice(0, -1).map((low, i) => ({
    label: label(low, edges[i + 1], i),
    games: [],
    record: record([]),
  }))
  for (const game of games) {
    const v = value(game)
    if (v === null) continue
    // The last edge is the open end: anything past it lands in the top bucket,
    // and anything below the first edge lands in the bottom one.
    let index = 0
    for (let i = 0; i < edges.length; i++) if (v >= edges[i]) index = i
    buckets[Math.min(index, buckets.length - 1)].games.push(game)
  }
  for (const bucket of buckets) bucket.record = record(bucket.games)
  return buckets
}

/** Full moves, which is what players count in — 60 plies is a 30-move game. */
export const moveCount = (game: GameRecord) => Math.ceil(game.plies / 2)

/** How much stronger the opponent was, on paper. Null when either was unrated. */
export function ratingGap(game: GameRecord): number | null {
  if (game.elo === null || game.oppElo === null) return null
  return game.oppElo - game.elo
}

// --- Endings --------------------------------------------------------------

export interface EndingSplit {
  end: Ending
  won: number
  lost: number
  drawn: number
}

/**
 * How games finish, and on which side of the result.
 *
 * "I lose on time nine times but win on time twice" is the interesting shape
 * here, so each ending is kept split rather than totalled.
 */
export function endings(games: GameRecord[]): EndingSplit[] {
  const order: Ending[] = ['resign', 'mate', 'time', 'draw']
  return order
    .map((end) => {
      const list = games.filter((game) => game.end === end)
      const { wins, draws, losses } = record(list)
      return { end, won: wins, lost: losses, drawn: draws }
    })
    .filter((split) => split.won + split.lost + split.drawn > 0)
}

// --- Openings -------------------------------------------------------------

export interface OpeningSplit extends Split {
  eco: string
}

/**
 * Cut a book name back to the family a player would name.
 *
 * The book returns the longest line it knows, which would scatter 143 games
 * over 80 names, so everything after the colon goes: "Sicilian: Najdorf" and
 * "Sicilian: Dragon" both count as Sicilians. The trailing noun goes too —
 * without it "French Defence" and "French: Winawer" would sit in two different
 * families for no reason a player would recognise.
 */
function family(name: string): string {
  return name
    .split(':')[0]
    .trim()
    .replace(/ (Defence|Defense|Opening|Game|Attack|System)$/, '')
}

/** The lines actually played, named by the app's own opening book. */
export function openings(games: GameRecord[], top: number): OpeningSplit[] {
  const named = new Map<string, { eco: string; games: GameRecord[] }>()
  for (const game of games) {
    const hit = findOpening(game.moves)
    const name = hit ? family(hit.name) : 'Unbooked'
    const bucket = named.get(name)
    if (bucket) bucket.games.push(game)
    else named.set(name, { eco: hit?.eco ?? '', games: [game] })
  }
  return [...named]
    .map(([label, { eco, games: list }]) => ({ label, eco, games: list, record: record(list) }))
    .sort((a, b) => b.games.length - a.games.length)
    .slice(0, top)
}

// --- Activity -------------------------------------------------------------

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export interface ActivityCell {
  /** 0 = Monday. */
  day: number
  /** Start of a three-hour block, UTC. */
  hour: number
  games: GameRecord[]
}

/**
 * Games per weekday and three-hour block, in UTC.
 *
 * Three-hour blocks rather than hours: 143 games over 168 hourly cells is
 * mostly empty space, and the shape of a week survives the coarser grid.
 */
export function activity(games: GameRecord[], blockHours = 3): ActivityCell[] {
  const blocks = 24 / blockHours
  const cells: ActivityCell[] = []
  for (let day = 0; day < 7; day++) {
    for (let block = 0; block < blocks; block++) {
      cells.push({ day, hour: block * blockHours, games: [] })
    }
  }
  for (const game of games) {
    const when = new Date(playedAt(game))
    // getUTCDay is Sunday-first; the grid reads Monday-first.
    const day = (when.getUTCDay() + 6) % 7
    const block = Math.floor(when.getUTCHours() / blockHours)
    cells[day * blocks + block].games.push(game)
  }
  return cells
}

// --- Streaks --------------------------------------------------------------

export interface Streak {
  kind: 'win' | 'loss'
  length: number
  from: string
  to: string
}

/** The longest run of wins and the longest run of losses, chronologically. */
export function streaks(games: GameRecord[]): Streak[] {
  const best: { win: Streak; loss: Streak } = {
    win: { kind: 'win', length: 0, from: '', to: '' },
    loss: { kind: 'loss', length: 0, from: '', to: '' },
  }
  let run = 0
  let kind: Streak['kind'] | null = null
  let start = ''
  for (const game of games) {
    const now: Streak['kind'] | null = game.score === 1 ? 'win' : game.score === 0 ? 'loss' : null
    if (now === null) {
      run = 0
      kind = null
      continue
    }
    if (now === kind) run++
    else {
      run = 1
      kind = now
      start = game.date
    }
    if (run > best[now].length) best[now] = { kind: now, length: run, from: start, to: game.date }
  }
  return [best.win, best.loss].filter((streak) => streak.length > 0)
}
