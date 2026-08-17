/**
 * Remembered choices, in localStorage.
 *
 * Only things the player actually chose are kept: who they play, at what
 * strength, time control, and analysis display. Not the game in progress, and
 * not state the app sets on the player's behalf.
 *
 * Everything read back is validated against the current options rather than
 * trusted. A stale key from an older build, or a hand-edited one, then falls
 * back to the default instead of putting the app in a state it can't render.
 */

import type { MaiaPanelView } from './engines/maia'
import { MAIA_MOVE_COUNT_MAX, MAIA_MOVE_COUNT_MIN, MAIA_RATINGS } from './engines/maia'
import { OPENINGS_PER_MOVE_MAX, OPENINGS_PER_MOVE_MIN } from './chess/openings'
import type { PieceStyle } from './components/Board'
import { EXPLORE_VARIANTS_MAX, EXPLORE_VARIANTS_MIN, TIME_CONTROLS, type Setup } from './components/Setup'
import type { Pace } from './chess/thinkTime'

const KEY = 'gambit:prefs:v1'

export type Theme = 'white' | 'black'

/** Board colour palettes, applied on top of either app theme. */
export type BoardTheme = 'wood' | 'emerald' | 'ocean' | 'midnight'

export interface Prefs {
  setup: Setup
  theme: Theme
  boardTheme: BoardTheme
  orientation: 'w' | 'b'
  evalOn: boolean
  /** Compare the five bands, or study one band's top moves. */
  maiaPanelView: MaiaPanelView
  /** The band the single-band view is showing. */
  maiaPanelBand: number
  /** How many moves that view lists. */
  maiaMoveCount: number
  /** How many openings are nested under each one-band move row. */
  openingsPerMove: number
  showDefence: boolean
  pieceStyle: PieceStyle
  /** Whether the 3D camera is unlocked for pan/zoom; off keeps the board fixed. */
  freeView3d: boolean
  /** Whether the evaluation bar is drawn while analysis is on. */
  showBar: boolean
  /** Whether the engine's best-move arrow is drawn while analysis is on. */
  showArrows: boolean
  /** Whether the move list shows each move's Maia 2500 probability. */
  showHistoryMaia: boolean
  /** Whether the move list shows Stockfish's evaluation of each move. */
  showHistorySf: boolean
  sound: boolean
}

export const DEFAULT_PREFS: Prefs = {
  setup: {
    opponent: 'maia',
    playerColor: 'w',
    maiaRating: 1500,
    maiaPace: 'human',
    timeControl: TIME_CONTROLS[2],
    explore: false,
    exploreVariants: 3,
  },
  theme: 'white',
  boardTheme: 'wood',
  orientation: 'w',
  evalOn: false,
  maiaPanelView: 'bands',
  maiaPanelBand: 1500,
  maiaMoveCount: 5,
  openingsPerMove: 3,
  showDefence: false,
  pieceStyle: 'classic',
  freeView3d: false,
  showBar: true,
  showArrows: true,
  showHistoryMaia: false,
  showHistorySf: false,
  sound: true,
}

/** Take `value` only if it is one of `allowed`, else the default. */
function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** A whole number inside [min, max], else the default. */
function count(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  return value >= min && value <= max ? value : fallback
}

export function loadPrefs(): Prefs {
  let raw: unknown
  try {
    const text = localStorage.getItem(KEY)
    if (!text) return DEFAULT_PREFS
    raw = JSON.parse(text)
  } catch {
    // Private browsing, a disabled store, or malformed JSON. Not worth a fuss.
    return DEFAULT_PREFS
  }
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS

  const stored = raw as Partial<Prefs> & { showDefenceCircles?: unknown; coinPieces?: unknown }
  const setup = (stored.setup ?? {}) as Partial<Setup> & { timeControl?: { label?: string } }
  const d = DEFAULT_PREFS

  // Time controls are re-resolved by label, so editing the list in code doesn't
  // leave anyone holding an object that no longer exists in it.
  const timeControl =
    TIME_CONTROLS.find((tc) => tc.label === setup.timeControl?.label) ?? d.setup.timeControl

  // The style used to be a boolean, and before that it was called circles.
  // Anyone who had coins on keeps them; everything else falls back to classic.
  // The glass and neon 3D styles were retired in favour of wood and marble;
  // anyone who had them stays in 3D.
  const storedStyle =
    (stored.pieceStyle as string) === '3d-glass' || (stored.pieceStyle as string) === '3d-neon'
      ? '3d'
      : stored.pieceStyle
  const legacyCoins = bool(stored.coinPieces, bool(stored.showDefenceCircles, false))
  const pieceStyle = oneOf<PieceStyle>(
    storedStyle,
    ['classic', 'coin', '3d', '3d-marble'],
    legacyCoins ? 'coin' : d.pieceStyle,
  )

  return {
    setup: {
      // Maia is the only main game opponent. Keep the stored field for
      // compatibility with older preferences, but migrate old choices here.
      opponent: 'maia',
      playerColor: oneOf<'w' | 'b'>(setup.playerColor, ['w', 'b'], d.setup.playerColor),
      maiaRating: oneOf<number>(setup.maiaRating, MAIA_RATINGS, d.setup.maiaRating),
      maiaPace: oneOf<Pace>(setup.maiaPace, ['fast', 'human', 'slow'], d.setup.maiaPace),
      timeControl,
      explore: bool(setup.explore, d.setup.explore),
      exploreVariants: count(
        setup.exploreVariants,
        EXPLORE_VARIANTS_MIN,
        EXPLORE_VARIANTS_MAX,
        d.setup.exploreVariants,
      ),
    },
    theme: oneOf<Theme>(stored.theme, ['white', 'black'], d.theme),
    boardTheme: oneOf<BoardTheme>(stored.boardTheme, ['wood', 'emerald', 'ocean', 'midnight'], d.boardTheme),
    orientation: oneOf<'w' | 'b'>(stored.orientation, ['w', 'b'], d.orientation),
    evalOn: bool(stored.evalOn, d.evalOn),
    maiaPanelView: oneOf<MaiaPanelView>(stored.maiaPanelView, ['bands', 'moves'], d.maiaPanelView),
    maiaPanelBand: oneOf<number>(stored.maiaPanelBand, MAIA_RATINGS, d.maiaPanelBand),
    maiaMoveCount: count(stored.maiaMoveCount, MAIA_MOVE_COUNT_MIN, MAIA_MOVE_COUNT_MAX, d.maiaMoveCount),
    openingsPerMove: count(
      stored.openingsPerMove,
      OPENINGS_PER_MOVE_MIN,
      OPENINGS_PER_MOVE_MAX,
      d.openingsPerMove,
    ),
    showDefence: bool(stored.showDefence, d.showDefence),
    pieceStyle,
    freeView3d: bool(stored.freeView3d, d.freeView3d),
    showBar: bool(stored.showBar, d.showBar),
    showArrows: bool(stored.showArrows, d.showArrows),
    showHistoryMaia: bool(stored.showHistoryMaia, d.showHistoryMaia),
    showHistorySf: bool(stored.showHistorySf, d.showHistorySf),
    sound: bool(stored.sound, d.sound),
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // A full or unavailable store shouldn't take the game down with it.
  }
}

export function clearPrefs(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}
