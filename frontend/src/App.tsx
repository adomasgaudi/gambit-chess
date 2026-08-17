import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'

import { Board, type Arrow, type PieceStyle } from './components/Board'
// three.js is most of a megabyte and only the 3D style needs it, so the whole
// scene is fetched the first time someone switches to it.
const Board3D = lazy(() => import('./components/Board3D').then((module) => ({ default: module.Board3D })))
import type { Board3DVariant } from './components/Board3D'
import { CapturedRow, Clock, EvalBar, MoveList, PromotionDialog } from './components/Panels'
import {
  EXPLORE_VARIANTS_MAX,
  EXPLORE_VARIANTS_MIN,
  GameSetup,
  type Setup,
} from './components/Setup'
import { Landing, type LandingChoice } from './components/Landing'
import { AnalysisPanel } from './components/AnalysisPanel'
import { ToolsMenu } from './components/ToolsMenu'
import { OPENINGS_PER_MOVE_MAX, OPENINGS_PER_MOVE_MIN } from './chess/openings'

import {
  appendUci,
  applyMove,
  capturedPieces,
  checkSquare as findCheckSquare,
  defenceMap,
  fenAt,
  goTo,
  isPromotion,
  legalDests,
  materialBalance,
  newGame,
  outcome,
  positionAt,
  takeback,
  toPgn,
  uciHistory,
  type GameState,
  type PieceRole,
} from './chess/game'
import { PACE_LABELS, sleep, thinkingDelayMs, type Pace } from './chess/thinkTime'
import {
  MAIA_RATINGS,
  MaiaOffline,
  maiaEvaluate,
  maiaHealth,
  maiaMove,
  MAIA_MOVE_COUNT_MAX,
  MAIA_MOVE_COUNT_MIN,
  maiaValueToScore,
  type MaiaCandidate,
  type MaiaEvaluation,
  type MaiaPanelView,
} from './engines/maia'
import type { Score, UciMove } from './engines/types'
import { formatPercent, toWhitePov } from './engines/types'
import { uciToSan } from './chess/san'
import { StockfishSession } from './engines/stockfish'
import { loadPrefs, savePrefs, type BoardTheme, type Prefs, type Theme } from './prefs'
import { playMoveSound, playSound, setSoundEnabled } from './sound'
import { Changelog } from './components/Changelog'
import { Insights } from './components/Insights'
import { CollapsibleSection } from './components/CollapsibleSection'
import { ThemePicker } from './components/ThemePicker'
import { MaiaEvaluations } from './components/MaiaEvaluations'
import './App.css'

/** The landing page, the board, and the game history are the app's screens. */
type View = 'landing' | 'game' | 'insights'

const PIECE_STYLES: Record<PieceStyle, { label: string; icon: string; hint: string }> = {
  classic: { label: 'Classic', icon: '♟', hint: 'The flat piece artwork' },
  coin: { label: 'Coin', icon: '◉', hint: 'Each piece as a white or black disk with its emblem inside' },
  '3d': { label: '3D wood', icon: '⛰', hint: 'A real 3D board with turned wooden pieces' },
  '3d-marble': { label: '3D marble', icon: '◇', hint: 'Glossy ivory and slate pieces on the 3D board' },
}

const BOARD_THEMES: Record<BoardTheme, { label: string; swatch: string }> = {
  wood: { label: 'Wood', swatch: 'linear-gradient(135deg, #c3ab7f 50%, #6f5535 50%)' },
  emerald: { label: 'Emerald', swatch: 'linear-gradient(135deg, #ebecd0 50%, #739552 50%)' },
  ocean: { label: 'Ocean', swatch: 'linear-gradient(135deg, #dee3e6 50%, #788c93 50%)' },
  midnight: { label: 'Midnight', swatch: 'linear-gradient(135deg, #56575e 50%, #313238 50%)' },
}

interface ClockState {
  w: number
  b: number
  /** Epoch ms at which the running side's clock started counting down. */
  since: number | null
  running: 'w' | 'b' | null
}

export default function App() {
  // Read once, at mount. Later writes go through savePrefs, so re-reading would
  // only ever tell us what we already know.
  const [initialPrefs] = useState<Prefs>(loadPrefs)

  const [view, setView] = useState<View>('landing')
  const [setup, setSetup] = useState<Setup>(initialPrefs.setup)
  const [theme, setTheme] = useState<Theme>(initialPrefs.theme)
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(initialPrefs.boardTheme)
  const [showSetup, setShowSetup] = useState(true)
  const [game, setGame] = useState<GameState>(() => newGame())
  const [orientation, setOrientation] = useState<'w' | 'b'>(initialPrefs.orientation)
  const [sound, setSound] = useState(initialPrefs.sound)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [thinking, setThinking] = useState(false)
  /** The live FEN for which the user explicitly asked Maia to reply pre-game. */
  const [manualResponseFen, setManualResponseFen] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState('')
  const [maiaOnline, setMaiaOnline] = useState<boolean | null>(null)
  const [resigned, setResigned] = useState<'w' | 'b' | null>(null)
  const [flagged, setFlagged] = useState<'w' | 'b' | null>(null)

  const [evalOn, setEvalOn] = useState(initialPrefs.evalOn)
  const [maiaPanelView, setMaiaPanelView] = useState<MaiaPanelView>(initialPrefs.maiaPanelView)
  const [maiaPanelBand, setMaiaPanelBand] = useState<number>(initialPrefs.maiaPanelBand)
  const [maiaMoveCount, setMaiaMoveCount] = useState<number>(initialPrefs.maiaMoveCount)
  const [openingsPerMove, setOpeningsPerMove] = useState<number>(initialPrefs.openingsPerMove)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [showDefence, setShowDefence] = useState(initialPrefs.showDefence)
  const [pieceStyle, setPieceStyle] = useState<PieceStyle>(initialPrefs.pieceStyle)
  const [freeView3d, setFreeView3d] = useState(initialPrefs.freeView3d)
  const [showBar, setShowBar] = useState(initialPrefs.showBar)
  const [showArrows, setShowArrows] = useState(initialPrefs.showArrows)
  const [showHistoryMaia, setShowHistoryMaia] = useState(initialPrefs.showHistoryMaia)
  const [showHistorySf, setShowHistorySf] = useState(initialPrefs.showHistorySf)
  /** Which sidebar tab is open in a live game. */
  const [sidebarTab, setSidebarTab] = useState<'play' | 'board' | 'analysis'>('play')
  /** The square currently picked on the board, so the engine can list that piece alone. */
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [evaluations, setEvaluations] = useState<MaiaEvaluation[]>([])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  /** The Maia move currently under the cursor, drawn on the board as an arrow. */
  const [hoveredMove, setHoveredMove] = useState<UciMove | null>(null)
  /**
   * Explore mode: the opponent's deferred reply, offered as alternatives.
   * `fen` is the live position the reply belongs to, so a stale choice can be
   * told apart from the current one.
   */
  const [exploreChoice, setExploreChoice] = useState<{
    fen: string
    bestmove: UciMove
    candidates: MaiaCandidate[]
  } | null>(null)

  const [clock, setClock] = useState<ClockState>({ w: 0, b: 0, since: null, running: null })
  const [, forceTick] = useState(0)

  const chess = useMemo(() => positionAt(game), [game])
  const fen = chess.fen()
  const atLive = game.cursor === game.plies.length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dests = useMemo(() => legalDests(chess), [fen])

  const result = useMemo(() => {
    // While the setup panel is open, the cursor is the position being edited.
    // Once play starts, the result belongs to the end of the live mainline even
    // when the player is browsing an earlier move.
    const natural = outcome(showSetup ? positionAt(game) : positionAt(game, game.plies.length))
    if (natural.over) return natural
    if (resigned) {
      const winner = resigned === 'w' ? 'Black' : 'White'
      return { over: true, result: resigned === 'w' ? '0-1' : '1-0', reason: `${winner} wins by resignation` }
    }
    if (flagged) {
      const winner = flagged === 'w' ? 'Black' : 'White'
      return { over: true, result: flagged === 'w' ? '0-1' : '1-0', reason: `${winner} wins on time` }
    }
    return natural
  }, [game, resigned, flagged, showSetup])

  const engineColor: 'w' | 'b' | null = setup.opponent === 'maia' ? (setup.playerColor === 'w' ? 'b' : 'w') : null

  const movable: Array<'w' | 'b'> = useMemo(() => {
    if (result.over) return []
    // Pregame is an analysis position: either side can be explored, including
    // a branch from a browsed-back move. Live play remains turn- and cursor-bound.
    if (showSetup) return ['w', 'b']
    if (!atLive) return []
    return [setup.playerColor]
  }, [atLive, setup.playerColor, result.over, showSetup])

  const lastMove = game.cursor > 0 ? game.plies[game.cursor - 1] : null

  /**
   * The remembered copy of the choices. It is deliberately not just a mirror of
   * live state: preferences are updated only by user-facing choices, while
   * engine replies and game progress remain transient.
   */
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs)

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  // These only ever change because the player changed them, so they can
  // be mirrored straight across without a second copy to keep in step.
  useEffect(() => {
    setPrefs((p) => ({
      ...p,
      theme,
      boardTheme,
      maiaPanelView,
      maiaPanelBand,
      maiaMoveCount,
      openingsPerMove,
      showDefence,
      pieceStyle,
      freeView3d,
      showBar,
      showArrows,
      showHistoryMaia,
      showHistorySf,
      sound,
    }))
  }, [theme, boardTheme, maiaPanelView, maiaPanelBand, maiaMoveCount, openingsPerMove, showDefence, pieceStyle, freeView3d, showBar, showArrows, showHistoryMaia, showHistorySf, sound])

  // A hovered move belongs to the position it was listed for; leaving that
  // position must not leave its arrow pointing at unrelated squares.
  useEffect(() => setHoveredMove(null), [fen])

  const toggleEval = useCallback(() => {
    const next = !evalOn
    setEvalOn(next)
    setPrefs((p) => ({ ...p, evalOn: next }))
  }, [evalOn])

  const setBoardOrientation = useCallback((next: 'w' | 'b') => {
    setOrientation(next)
    setPrefs((current) => ({ ...current, orientation: next }))
  }, [])

  const flipBoard = useCallback(() => {
    setOrientation((current) => {
      const next = current === 'w' ? 'b' : 'w'
      setPrefs((prefs) => ({ ...prefs, orientation: next }))
      return next
    })
  }, [])

  const changeMaiaRating = useCallback((rating: number) => {
    if (!MAIA_RATINGS.includes(rating as (typeof MAIA_RATINGS)[number])) return
    setSetup((current) => ({ ...current, maiaRating: rating }))
    setPrefs((current) => ({
      ...current,
      setup: { ...current.setup, maiaRating: rating },
    }))
  }, [])

  const changeMaiaPace = useCallback((pace: Pace) => {
    setSetup((current) => ({ ...current, maiaPace: pace }))
    setPrefs((current) => ({
      ...current,
      setup: { ...current.setup, maiaPace: pace },
    }))
  }, [])

  const handleSetupChange = useCallback((draft: Setup) => {
    // Keep the pre-game analyser oriented toward the side being configured,
    // before the draft is submitted with Start game.
    setBoardOrientation(draft.playerColor)
    setPrefs((current) => ({
      ...current,
      setup: {
        ...current.setup,
        playerColor: draft.playerColor,
        timeControl: draft.timeControl,
      },
    }))
    setSetup((current) => {
      if (
        current.playerColor === draft.playerColor &&
        current.timeControl.label === draft.timeControl.label
      ) {
        return current
      }
      return {
        ...current,
        playerColor: draft.playerColor,
        timeControl: draft.timeControl,
      }
    })
  }, [setBoardOrientation])

  useEffect(() => setSoundEnabled(sound), [sound])
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const check = async () => {
      const health = await maiaHealth()
      if (cancelled) return
      const online = health?.ok ?? false
      setMaiaOnline(online)
      timer = window.setTimeout(check, online ? 15_000 : 2_000)
    }

    void check()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  // --------------------------------------------------------------- clocks
  useEffect(() => {
    if (!clock.running || result.over) return
    const id = window.setInterval(() => forceTick((n) => n + 1), 100)
    return () => window.clearInterval(id)
  }, [clock.running, result.over])

  /**
   * Freeze the clock while the New game panel is open, and pick it up again if
   * the player cancels back into the game. `running` still says whose turn it
   * is; a null `since` is what marks it paused.
   */
  useEffect(() => {
    setClock((c) => {
      if (!c.running) return c
      if (showSetup) {
        if (c.since === null) return c
        return { ...c, [c.running]: Math.max(0, c[c.running] - (Date.now() - c.since)), since: null }
      }
      return c.since === null ? { ...c, since: Date.now() } : c
    })
  }, [showSetup])

  const remaining = useCallback(
    (color: 'w' | 'b'): number | null => {
      if (setup.timeControl.initialSeconds === 0) return null
      const base = clock[color]
      if (clock.running === color && clock.since !== null) {
        return Math.max(0, base - (Date.now() - clock.since))
      }
      return Math.max(0, base)
    },
    [clock, setup.timeControl],
  )

  // Flag fall is checked on every tick render rather than on a timer, so it
  // stays in step with what the clock display is showing.
  const running = clock.running
  useEffect(() => {
    if (result.over || !running || setup.timeControl.initialSeconds === 0) return
    const left = remaining(running)
    if (left !== null && left <= 0) {
      setFlagged(running)
      setClock((c) => ({ ...c, running: null, since: null, [running]: 0 }))
      playSound('end')
    }
  }, [result.over, running, setup.timeControl.initialSeconds, remaining])

  /** Charge the mover for the time they used and hand the clock over. */
  const switchClock = useCallback(
    (mover: 'w' | 'b') => {
      const tc = setup.timeControl
      if (tc.initialSeconds === 0) return
      setClock((c) => {
        if (c.running !== mover) return c
        const elapsed = c.since === null ? 0 : Date.now() - c.since
        return {
          ...c,
          [mover]: Math.max(0, c[mover] - elapsed) + tc.incrementSeconds * 1000,
          running: mover === 'w' ? 'b' : 'w',
          since: Date.now(),
        }
      })
    },
    [setup.timeControl],
  )

  // ----------------------------------------------------------- move entry
  const commitMove = useCallback(
    (from: Square, to: Square, promotionRole?: PieceRole) => {
      const next = applyMove(game, { from, to, promotion: promotionRole })
      setPromotion(null)
      if (!next) return
      const ply = next.plies[next.plies.length - 1]
      setGame(next)
      playMoveSound(ply)
      switchClock(ply.color)
    },
    [game, switchClock],
  )

  const handleBoardMove = useCallback(
    (from: Square, to: Square) => {
      if (isPromotion(chess, from, to)) setPromotion({ from, to })
      else commitMove(from, to)
    },
    [chess, commitMove],
  )

  // ------------------------------------------------------ engine opponent
  const moveToken = useRef(0)
  // The engine's reply lands after an await, by which time the state it was
  // asked about may have moved on; the ref is what it appends to.
  const gameRef = useRef(game)
  gameRef.current = game
  const liveFen = fenAt(game, game.plies.length)
  const liveTurn = liveFen.split(' ')[1] as 'w' | 'b'

  useEffect(() => {
    // Note this deliberately ignores the cursor: the engine keeps playing on
    // the live position even while the player is browsing back through it.
    // The New game panel is different — the settings on screen are a draft
    // that isn't live until Start, so an old game answering underneath it
    // looks exactly like the new opponent moving on its own.
    const manualResponse = showSetup && manualResponseFen === liveFen
    if (!engineColor || result.over || (showSetup && !manualResponse)) return
    if (liveTurn !== engineColor) return

    const token = ++moveToken.current
    let cancelled = false
    setThinking(true)
    // Snapshot the engine's clock before any awaiting, so the think time is
    // budgeted against what it actually had when its turn began.
    const engineClockMs = remaining(engineColor)

    const think = async () => {
      try {
        let bestmove: string
        const startedAt = performance.now()
        const reply = await maiaMove(game.startFen, uciHistory(game, game.plies.length), setup.maiaRating)
        bestmove = reply.bestmove

        // Maia has already decided; the wait is what makes it look like a
        // person deciding, and it is the only thing that moves its clock.
        const target = thinkingDelayMs({
          pace: setup.maiaPace,
          remainingMs: engineClockMs,
          ply: game.plies.length,
          legalMoves: new Chess(liveFen).moves().length,
        })
        const spent = performance.now() - startedAt
        if (target > spent) await sleep(target - spent)
        if (cancelled || token !== moveToken.current) return

        // Explore mode defers the reply: the position is left standing and the
        // opponent's top replies are offered instead of one being played. The
        // picker keeps the position untouched, so the chosen move is appended
        // to the same mainline as a silent reply would have been.
        if (setup.explore && !showSetup) {
          setExploreChoice({
            fen: liveFen,
            bestmove: reply.bestmove,
            candidates: reply.policy.slice(0, setup.exploreVariants),
          })
          setStatusNote('')
          return
        }

        const next = appendUci(gameRef.current, bestmove)
        if (next) {
          setGame(next)
          playMoveSound(next.plies[next.plies.length - 1])
          switchClock(engineColor)
        }
        setStatusNote('')
      } catch (error) {
        if (cancelled) return
        if (error instanceof MaiaOffline) {
          setStatusNote('Maia server is offline — start it with: python server/app.py')
          setMaiaOnline(false)
        } else {
          setStatusNote(String(error))
        }
      } finally {
        if (!cancelled) {
          setThinking(false)
          if (showSetup) setManualResponseFen(null)
        }
      }
    }

    void think()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFen, engineColor, result.over, showSetup, setup, manualResponseFen])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defence = useMemo(() => (showDefence ? defenceMap(chess) : null), [fen, showDefence])

  // --------------------------------------------------------- Maia analysis
  useEffect(() => {
    if (view !== 'game' || !evalOn) {
      setEvaluations([])
      setAnalysisLoading(false)
      setAnalysisError('')
      return
    }
    if (maiaOnline !== true) {
      setEvaluations([])
      setAnalysisLoading(false)
      setAnalysisError(maiaOnline === false ? 'Maia server is offline — retrying…' : '')
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setAnalysisLoading(true)
    setAnalysisError('')

    // lc0 replays the move list from the FEN it is given, so the FEN has to be
    // the game's root. Sending the position at the cursor made lc0 reject the
    // whole command and keep answering for the previous position.
    // The five-band cards always show four candidates, so never ask for fewer
    // than that even when the single-band view is set to show one move.
    void maiaEvaluate(
      game.startFen,
      uciHistory(game, game.cursor),
      Math.max(5, maiaMoveCount),
      controller.signal,
    )
      .then((response) => {
        if (!cancelled) setEvaluations(response.evaluations)
      })
      .catch((error) => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return
        setEvaluations([])
        setAnalysisError(error instanceof MaiaOffline ? 'Maia server is offline' : String(error))
      })
      .finally(() => {
        if (!cancelled) setAnalysisLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fen, game, view, evalOn, maiaOnline, maiaMoveCount])

  // ------------------------------------------- Maia 2500 on the history
  // When the option is on, every position in the move list is asked what the
  // 2500 band thinks of the move that was actually played there. Requests run
  // four at a time; a single failure just leaves that row without a figure.
  // The move sequence alone keys the effect: navigating the cursor must not
  // re-ask every position.
  const pliesKey = useMemo(() => game.plies.map((ply) => ply.uci).join(' '), [game.plies])
  const [historyMaiaPercent, setHistoryMaiaPercent] = useState<Map<number, number>>(new Map())
  const [historyMaiaScore, setHistoryMaiaScore] = useState<Map<number, Score>>(new Map())
  const [historyMaiaLoading, setHistoryMaiaLoading] = useState(false)

  useEffect(() => {
    if (!showHistoryMaia || view !== 'game' || maiaOnline !== true) {
      setHistoryMaiaPercent(new Map())
      setHistoryMaiaScore(new Map())
      setHistoryMaiaLoading(false)
      return
    }
    const plies = game.plies
    if (plies.length === 0) return

    let cancelled = false
    const controller = new AbortController()
    const percent = new Map<number, number>()
    const scores = new Map<number, Score>()
    let next = 0
    let inFlight = 0
    let finished = 0
    setHistoryMaiaLoading(true)

    const fetchOne = (cursor: number) => {
      if (cancelled || inFlight >= 4) return false
      inFlight += 1
      maiaMove(game.startFen, plies.slice(0, cursor).map((ply) => ply.uci), 2500, controller.signal)
        .then((response) => {
          if (cancelled) return
          const played = plies[cursor].uci
          const match = response.policy.find((candidate) => candidate.move === played)
          if (match) percent.set(cursor, match.probability)
          if (typeof response.value === 'number') {
            scores.set(cursor, maiaValueToScore(response.value, plies[cursor].color))
          }
          setHistoryMaiaPercent(new Map(percent))
          setHistoryMaiaScore(new Map(scores))
        })
        .catch(() => {
          /* one unreachable position doesn't sink the rest */
        })
        .finally(() => {
          inFlight -= 1
          finished += 1
          if (!cancelled && finished === plies.length) setHistoryMaiaLoading(false)
          else if (!cancelled) pump()
        })
      return true
    }
    const pump = () => {
      while (next < plies.length && fetchOne(next)) next += 1
    }
    pump()

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistoryMaia, view, game.startFen, pliesKey, maiaOnline])

  // ----------------------------------------- Stockfish on the history
  // One WASM session lives for the whole game screen and serves both the move
  // list (depth 12, background) and the analysis rows (depth 8, priority, so
  // they don't wait behind the full scan). Scores are shown from White's POV.
  const sfSessionRef = useRef<StockfishSession | null>(null)

  useEffect(() => {
    if (view !== 'game') {
      sfSessionRef.current?.dispose()
      sfSessionRef.current = null
      return
    }
    return () => {
      sfSessionRef.current?.dispose()
      sfSessionRef.current = null
    }
  }, [view])

  // The one session serves the whole game screen: the move list badges, the
  // analysis rows, and the live Stockfish card. It is created the first time
  // any of them needs it and disposed when leaving the game.
  const ensureSf = useCallback((): StockfishSession | null => {
    if (!sfSessionRef.current) {
      try {
        sfSessionRef.current = new StockfishSession()
      } catch {
        return null
      }
    }
    return sfSessionRef.current
  }, [])

  const [historySfScore, setHistorySfScore] = useState<Map<number, Score>>(new Map())
  const [historySfLoading, setHistorySfLoading] = useState(false)

  useEffect(() => {
    if (!showHistorySf || view !== 'game') {
      setHistorySfScore(new Map())
      setHistorySfLoading(false)
      return
    }
    const plies = game.plies
    if (plies.length === 0) return
    const session = ensureSf()
    if (!session) {
      setHistorySfLoading(false)
      return
    }

    let disposed = false
    let finished = 0
    setHistorySfLoading(true)
    plies.forEach((ply, cursor) => {
      session
        .evaluate(game.startFen, plies.slice(0, cursor).map((p) => p.uci))
        .then((score) => {
          if (disposed || !score) return
          const whitePov = toWhitePov(score, ply.color)
          setHistorySfScore((previous) => {
            const next = new Map(previous)
            next.set(cursor, whitePov)
            return next
          })
        })
        .finally(() => {
          finished += 1
          if (!disposed && finished === plies.length) setHistorySfLoading(false)
        })
    })

    return () => {
      disposed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistorySf, view, game.startFen, pliesKey])

  // ----------------------------------- per-move scores in the analysis rows
  // For each move the one-band view lists, ask what the position AFTER that
  // move is worth — Maia (selected band) and Stockfish. Both answer from the
  // position after the move, converted to White's point of view. They are part
  // of the analysis itself, so they follow the analysis switch, not the move
  // list's badge toggles.
  const [rowScores, setRowScores] = useState<Map<UciMove, { maia: Score | null; sf: Score | null }>>(
    new Map(),
  )

  useEffect(() => {
    setRowScores(new Map())
    if (view !== 'game' || !evalOn || maiaPanelView !== 'moves') return
    const reference = evaluations.find((evaluation) => evaluation.rating === maiaPanelBand) ?? evaluations[0]
    if (!reference || reference.candidates.length === 0) return
    const historyMoves = uciHistory(game, game.cursor)
    const turnAfter: 'w' | 'b' = chess.turn() === 'w' ? 'b' : 'w'
    const session = ensureSf()
    const controller = new AbortController()
    let cancelled = false

    for (const candidate of reference.candidates.slice(0, maiaMoveCount)) {
      const rowMoves = [...historyMoves, candidate.move]
      const maiaPromise =
        maiaOnline === true
          ? maiaMove(game.startFen, rowMoves, maiaPanelBand, controller.signal)
              .then((response) =>
                typeof response.value === 'number' ? maiaValueToScore(response.value, turnAfter) : null,
              )
              .catch(() => null)
          : Promise.resolve(null)
      const sfPromise = session
        ? session
            .evaluate(game.startFen, rowMoves, 8, true)
            .then((score) => (score ? toWhitePov(score, turnAfter) : null))
        : Promise.resolve(null)
      void Promise.all([maiaPromise, sfPromise]).then(([maia, sf]) => {
        if (cancelled) return
        setRowScores((previous) => {
          const next = new Map(previous)
          next.set(candidate.move, { maia, sf })
          return next
        })
      })
    }

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, evalOn, maiaPanelView, maiaPanelBand, maiaMoveCount, evaluations, fen, maiaOnline, pliesKey])

  // ------------------------- live Stockfish read for the analysis card
  // The card shows what Stockfish makes of the position on the board, as
  // White's score and its best move; it refreshes whenever the position does.
  const [sfCurrent, setSfCurrent] = useState<{ score: Score | null; bestmove: UciMove | null; loading: boolean }>({
    score: null,
    bestmove: null,
    loading: false,
  })

  useEffect(() => {
    setSfCurrent({ score: null, bestmove: null, loading: false })
    if (view !== 'game' || !evalOn) return
    const session = ensureSf()
    if (!session) return
    let disposed = false
    setSfCurrent((current) => ({ ...current, loading: true }))
    session
      .evaluate(game.startFen, uciHistory(game, game.cursor), 10, true)
      .then((score) => {
        if (disposed) return
        setSfCurrent({ score, bestmove: session.lastBestMove, loading: false })
      })
    return () => {
      disposed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, evalOn, fen, pliesKey])

  const currentScore: Score | null = useMemo(() => {
    if (result.over && game.cursor === game.plies.length) {
      if (result.result === '1-0') return { mate: 1 }
      if (result.result === '0-1') return { mate: -1 }
      return { cp: 0 }
    }
    const reference = evaluations.find((evaluation) => evaluation.rating === 1500) ?? evaluations[2]
    return reference ? maiaValueToScore(reference.value, chess.turn()) : null
  }, [evaluations, chess, game.cursor, game.plies.length, result])

  // ----------------------------------------------------------- navigation
  const navigate = useCallback((delta: number | 'start' | 'end') => {
    setGame((prev) => {
      if (delta === 'start') return goTo(prev, 0)
      if (delta === 'end') return goTo(prev, prev.plies.length)
      return goTo(prev, prev.cursor + delta)
    })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') navigate(-1)
      else if (event.key === 'ArrowRight') navigate(1)
      else if (event.key === 'ArrowUp') navigate('start')
      else if (event.key === 'ArrowDown') navigate('end')
      else if (event.key === 'f') flipBoard()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipBoard, navigate])

  // ------------------------------------------------------------- new game
  /** The only main game choice is Maia; rating and clock are set next. */
  const chooseFromLanding = useCallback((_choice: LandingChoice) => {
    setView('game')
    setStatusNote('')

    setSetup((prev) => ({ ...prev, opponent: 'maia' }))
    setShowSetup(true)
  }, [])

  const startGame = useCallback((next: Setup) => {
    moveToken.current++
    const preparedGame: GameState = {
      ...game,
      plies: game.plies.slice(0, game.cursor),
      cursor: game.cursor,
    }
    setSetup(next)
    // Starting a game is the moment these stop being a draft and become the
    // answer worth remembering for next time.
    setPrefs((p) => ({ ...p, setup: next }))
    setView('game')
    setShowSetup(false)
    // Keep the position and mainline built in pregame. If the user browsed
    // back through the line, start from that visible position and discard the
    // abandoned continuation.
    setGame(preparedGame)
    setEvaluations([])
    setAnalysisError('')
    setManualResponseFen(null)
    setExploreChoice(null)
    setResigned(null)
    setFlagged(null)
    setStatusNote('')
    const ms = next.timeControl.initialSeconds * 1000
    const startingColor = positionAt(preparedGame).turn()
    setClock({
      w: ms,
      b: ms,
      since: ms > 0 ? Date.now() : null,
      running: ms > 0 ? startingColor : null,
    })
  }, [game])

  const askMaiaToRespond = useCallback(() => {
    if (!showSetup || thinking || result.over || !atLive || liveTurn !== engineColor) return
    setManualResponseFen(liveFen)
  }, [showSetup, thinking, result.over, atLive, liveTurn, engineColor, liveFen])

  const doTakeback = useCallback(() => {
    // Take back the player's move together with the engine's reply, so that it
    // is the player's turn again rather than the engine's.
    const last = game.plies[game.plies.length - 1]
    const plies = engineColor && last?.color === engineColor ? 2 : 1
    moveToken.current++
    setExploreChoice(null)
    setGame((prev) => takeback(prev, plies))
  }, [engineColor, game.plies])

  /** Play one of the offered replies, ending the explore pause. */
  const playExplore = useCallback(
    (uci: UciMove) => {
      moveToken.current++
      setExploreChoice(null)
      setStatusNote('')
      const next = appendUci(gameRef.current, uci)
      if (next) {
        setGame(next)
        playMoveSound(next.plies[next.plies.length - 1])
        if (engineColor) switchClock(engineColor)
      }
    },
    [engineColor, switchClock],
  )

  /** Leave the explore pause down the first variant — "continue the game". */
  const continueExplore = useCallback(() => {
    if (exploreChoice && exploreChoice.fen === liveFen) {
      playExplore(exploreChoice.candidates[0]?.move ?? exploreChoice.bestmove)
    }
  }, [exploreChoice, liveFen, playExplore])

  const toggleExplore = useCallback(() => {
    const next = { ...setup, explore: !setup.explore }
    // Turning it off mid-pause plays the main reply, so the game isn't left
    // hanging on a picker that will never be answered.
    if (setup.explore && exploreChoice && exploreChoice.fen === liveFen) {
      playExplore(exploreChoice.candidates[0]?.move ?? exploreChoice.bestmove)
    }
    setSetup(next)
    setPrefs((p) => ({ ...p, setup: next }))
  }, [setup, exploreChoice, liveFen, playExplore])

  const changeExploreVariants = useCallback(
    (n: number) => {
      const next = {
        ...setup,
        exploreVariants: Math.max(EXPLORE_VARIANTS_MIN, Math.min(EXPLORE_VARIANTS_MAX, n)),
      }
      setSetup(next)
      setPrefs((p) => ({ ...p, setup: next }))
    },
    [setup],
  )

  const copy = useCallback((text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setStatusNote(`${what} copied to clipboard`),
      () => setStatusNote(`Could not copy ${what}`),
    )
  }, [])

  // -------------------------------------------------------------- render
  const arrows: Arrow[] = useMemo(() => {
    const drawn: Arrow[] = []
    if (evalOn && showArrows) {
      const reference = evaluations.find((evaluation) => evaluation.rating === 1500) ?? evaluations[2]
      if (reference?.bestmove) {
        drawn.push({ from: reference.bestmove.slice(0, 2) as Square, to: reference.bestmove.slice(2, 4) as Square })
      }
    }
    // The hovered move wins the square it shares with the reference arrow, so
    // draw it last and in the alternate colour.
    if (hoveredMove) {
      const hovered: Arrow = {
        from: hoveredMove.slice(0, 2) as Square,
        to: hoveredMove.slice(2, 4) as Square,
        color: 'var(--arrow-alt)',
      }
      return [...drawn.filter((a) => a.from !== hovered.from || a.to !== hovered.to), hovered]
    }
    return drawn
  }, [evaluations, evalOn, showArrows, hoveredMove])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const captured = useMemo(() => capturedPieces(chess), [fen])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const balance = useMemo(() => materialBalance(chess), [fen])

  const opponentLabel = `Maia ${setup.maiaRating}`

  const topColor: 'w' | 'b' = orientation === 'w' ? 'b' : 'w'
  const bottomColor: 'w' | 'b' = orientation

  const nameFor = (color: 'w' | 'b'): string => {
    return color === setup.playerColor ? 'You' : opponentLabel
  }

  // With the options panel open and no game yet, there is no clock to show:
  // the time control isn't settled until Start, and a frozen 0:00 reads as a
  // player who has already flagged.
  const preGame = showSetup && game.plies.length === 0

  const maiaControls = setup.opponent === 'maia' && (
    <div className="maia-board-controls">
      <CollapsibleSection title="Elo" summary={setup.maiaRating} defaultOpen={false}>
        <label className="maia-board-elo" htmlFor="maia-board-elo">
          <span className="sr-only">Maia Elo</span>
          <input
            id="maia-board-elo"
            type="range"
            min={0}
            max={MAIA_RATINGS.length - 1}
            value={MAIA_RATINGS.indexOf(setup.maiaRating as (typeof MAIA_RATINGS)[number])}
            onChange={(event) => changeMaiaRating(MAIA_RATINGS[Number(event.target.value)])}
            aria-label="Maia Elo"
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection title="Thinking time" summary={PACE_LABELS[setup.maiaPace]} defaultOpen={false}>
        <div className="maia-pace-options">
          {(Object.keys(PACE_LABELS) as Pace[]).map((pace) => (
            <button
              key={pace}
              className={setup.maiaPace === pace ? 'active' : ''}
              onClick={() => changeMaiaPace(pace)}
            >
              {PACE_LABELS[pace]}
            </button>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Explore"
        summary={setup.explore ? `${setup.exploreVariants} variants` : 'off'}
        defaultOpen={false}
      >
        <div className="explore-variants-control">
          <button
            onClick={() => changeExploreVariants(setup.exploreVariants - 1)}
            disabled={setup.exploreVariants <= EXPLORE_VARIANTS_MIN}
            aria-label="Fewer explore variants"
          >
            −
          </button>
          <span>{setup.exploreVariants} variants</span>
          <button
            onClick={() => changeExploreVariants(setup.exploreVariants + 1)}
            disabled={setup.exploreVariants >= EXPLORE_VARIANTS_MAX}
            aria-label="More explore variants"
          >
            +
          </button>
          <button
            className={setup.explore ? 'active' : ''}
            onClick={toggleExplore}
            title="Turn explore mode on or off for this game"
          >
            {setup.explore ? 'on' : 'off'}
          </button>
        </div>
      </CollapsibleSection>
    </div>
  )

  const strip = (color: 'w' | 'b') => {
    const colorName = color === 'w' ? 'White' : 'Black'
    const name = nameFor(color)
    return (
    <div className="player-strip">
      <Clock
        ms={preGame ? null : remaining(color)}
        active={clock.running === color && !result.over}
        label={name}
        // Don't print "Black Black" when the player has no name but their colour.
        sub={name === colorName ? undefined : colorName}
      />
      <CapturedRow
        pieces={captured[color]}
        color={color === 'w' ? 'b' : 'w'}
        advantage={color === 'w' ? Math.max(0, balance) : Math.max(0, -balance)}
      />
      {color !== setup.playerColor && maiaControls}
    </div>
    )
  }

  if (view === 'landing') {
    return <Landing
      maiaOnline={maiaOnline}
      hasGameInProgress={game.plies.length > 0 && !result.over}
      theme={theme}
      onChoose={chooseFromLanding}
      onResume={() => setView('game')}
      onInsights={() => setView('insights')}
      onThemeChange={setTheme}
    />
  }

  if (view === 'insights') {
    return <Insights theme={theme} onBack={() => setView('landing')} onThemeChange={setTheme} />
  }

  const screen = showSetup ? 'setup' : 'live'

  return (
    <div className={`app theme-${theme} board-${boardTheme} screen-${screen}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setView('landing')} title="Back to the home page">
          <span className="brand-mark">♞</span> Gambit
        </button>
        {showSetup && <span className="screen-title">pre-game</span>}
        <div className="topbar-right">
          <ThemePicker theme={theme} onChange={setTheme} />
          <button className="ghost" onClick={() => setSound((s) => !s)} title="Toggle sound">
            {sound ? '🔊' : '🔇'}
          </button>
          <span
            className={`maia-dot ${maiaOnline ? 'on' : maiaOnline === false ? 'off' : ''}`}
            title={maiaOnline ? 'Maia server online' : 'Maia server offline — run: python server/app.py'}
          >
            Maia
          </span>
        </div>
      </header>

      <main className="layout">
        <section className="board-area">
          {evalOn && showBar && <EvalBar score={currentScore} orientation={orientation} />}

          <div className="board-stack">
            {strip(topColor)}

            <div className="board-wrap">
              {pieceStyle.startsWith('3d') ? (
                <Suspense fallback={<div className="board3d-loading">Setting up the board…</div>}>
                <Board3D
                  chess={chess}
                  orientation={orientation}
                  movable={movable}
                  lastMove={lastMove}
                  checkSquare={findCheckSquare(chess)}
                  dests={dests}
                  arrows={arrows}
                  onMove={handleBoardMove}
                  freeView={freeView3d}
                  onFreeViewChange={setFreeView3d}
                  onSelectChange={setSelectedSquare}
                  variant={pieceStyle as Board3DVariant}
                />
                </Suspense>
              ) : (
                <Board
                  chess={chess}
                  orientation={orientation}
                  movable={movable}
                  lastMove={lastMove}
                  checkSquare={findCheckSquare(chess)}
                  dests={dests}
                  arrows={arrows}
                  onMove={handleBoardMove}
                  defence={defence}
                  pieceStyle={pieceStyle}
                  onSelectChange={setSelectedSquare}
                />
              )}
              {promotion && (
                <PromotionDialog
                  color={chess.turn()}
                  square={promotion.to}
                  orientation={orientation}
                  onPick={(role) => commitMove(promotion.from, promotion.to, role)}
                  onCancel={() => setPromotion(null)}
                />
              )}
              {result.over && (
                <div className="result-overlay">
                  <div className="result-card">
                    <div className="result-score">{result.result}</div>
                    <div className="result-reason">{result.reason}</div>
                    <button className="primary" onClick={() => setShowSetup(true)}>
                      New game
                    </button>
                  </div>
                </div>
              )}
            </div>

            {strip(bottomColor)}
          </div>
        </section>

        <aside className="sidebar">
          {showSetup && (
            <GameSetup
              initial={setup}
              maiaOnline={maiaOnline}
              onStart={(next) => startGame({ ...next, maiaRating: setup.maiaRating, maiaPace: setup.maiaPace })}
              onChange={handleSetupChange}
              // With a game already on the board, cancelling goes back to it;
              // otherwise there is nothing behind the panel but the landing page.
              onCancel={game.plies.length > 0 ? () => setShowSetup(false) : () => setView('landing')}
              cancelLabel={game.plies.length > 0 ? 'Cancel' : 'Back'}
            />
          )}
          <div className="sidebar-tabs" role="tablist" aria-label="Sidebar sections">
                <button
                  className={sidebarTab === 'play' ? 'active' : ''}
                  onClick={() => setSidebarTab('play')}
                >
                  Play
                </button>
                <button
                  className={sidebarTab === 'board' ? 'active' : ''}
                  onClick={() => setSidebarTab('board')}
                >
                  Board
                </button>
                <button
                  className={sidebarTab === 'analysis' ? 'active' : ''}
                  onClick={() => setSidebarTab('analysis')}
                >
                  Analysis
                </button>
              </div>
          <div className="game-menu">
              {sidebarTab === 'play' && (
                <>
                {setup.explore && exploreChoice && atLive && exploreChoice.fen === liveFen && !showSetup && !result.over && (
                  <div className="explore-box">
                    <div className="explore-title">Explore — {opponentLabel} plays…</div>
                    {exploreChoice.candidates.map((candidate, i) => (
                      <button
                        key={candidate.move}
                        className={`explore-move${i === 0 ? ' main' : ''}`}
                        onClick={() => playExplore(candidate.move)}
                        title={
                          i === 0
                            ? 'The first variant — the reply the game continues from'
                            : 'Explore what happens if the opponent plays this instead'
                        }
                      >
                        <span className="explore-rank">{i + 1}</span>
                        <span className="explore-san">{uciToSan(exploreChoice.fen, candidate.move)}</span>
                        <span className="explore-prob">{formatPercent(candidate.probability)}</span>
                        {i === 0 && <span className="explore-main">main line</span>}
                      </button>
                    ))}
                    <button className="explore-continue" onClick={continueExplore}>
                      Continue from the first variant
                    </button>
                  </div>
                )}
                <div className="actions">
                  {showSetup && (
                    <button
                      className="primary maia-respond"
                      onClick={askMaiaToRespond}
                      disabled={thinking || result.over || !atLive || liveTurn !== engineColor}
                    >
                      Maia responds
                    </button>
                  )}
                  <button onClick={() => setShowSetup(true)}>New game</button>
                  <button onClick={doTakeback} disabled={game.plies.length === 0 || showSetup}>
                    Takeback
                  </button>
                  <button
                    className={`explore-toggle${setup.explore ? ' active' : ''}`}
                    onClick={toggleExplore}
                    disabled={showSetup || game.plies.length === 0}
                    title="On: after each of your moves, choose which of the opponent's replies to follow — explore it, then continue from the first variant. Off: Maia plays its best reply as usual."
                  >
                    Explore {setup.explore ? 'on' : 'off'}
                  </button>
                  <button
                    onClick={() => {
                      setResigned(setup.playerColor)
                      playSound('end')
                    }}
                    disabled={result.over || showSetup || game.plies.length === 0}
                  >
                    Resign
                  </button>
                  <div className="tools-anchor">
                    <button className="wide" onClick={() => setToolsOpen((open) => !open)}>
                      More ⋯
                    </button>
                    {toolsOpen && (
                      <ToolsMenu
                        onClose={() => setToolsOpen(false)}
                        items={[
                          {
                            label: 'Copy PGN',
                            onSelect: () => copy(toPgn(game, pgnHeaders(setup, opponentLabel, result.result)), 'PGN'),
                          },
                          { label: 'Copy FEN', onSelect: () => copy(fen, 'FEN') },
                          {
                            label: 'Flip board',
                            divider: true,
                            onSelect: flipBoard,
                          },
                          { label: sound ? 'Mute sound' : 'Unmute sound', onSelect: () => setSound((s) => !s) },
                        ]}
                      />
                    )}
                  </div>
                </div>
                </>
              )}

              {sidebarTab === 'board' && (
                <>
                  <div className="tab-group-label">Board overlays</div>
              <div className="overlay-options">
                <button
                  className={`overlay-toggle${showDefence ? ' active' : ''}`}
                  onClick={() => setShowDefence((v) => !v)}
                  title="Show arrows from defenders to the pieces they protect"
                >
                  🛡 Defenders {showDefence ? 'on' : 'off'}
                </button>
                <button
                  className={`overlay-toggle${evalOn && showBar ? ' active' : ''}`}
                  onClick={() => setShowBar((v) => !v)}
                  title="Draw the evaluation bar beside the board while analysis is on"
                  disabled={!evalOn}
                >
                  ▮ Eval bar {evalOn && showBar ? 'on' : 'off'}
                </button>
                <button
                  className={`overlay-toggle${evalOn && showArrows ? ' active' : ''}`}
                  onClick={() => setShowArrows((v) => !v)}
                  title="Draw the engine's best-move arrow on the board while analysis is on"
                  disabled={!evalOn}
                >
                  ➤ Engine arrows {evalOn && showArrows ? 'on' : 'off'}
                </button>
              </div>
                  <div className="tab-group-label">Board colours</div>
              <div className="overlay-options board-themes">
                {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((name) => (
                  <button
                    key={name}
                    className={`overlay-toggle board-theme${boardTheme === name ? ' active' : ''}`}
                    onClick={() => setBoardTheme(name)}
                    title={`${BOARD_THEMES[name].label} squares and frame`}
                  >
                    <span className="board-theme-swatch" style={{ background: BOARD_THEMES[name].swatch }} />
                    {BOARD_THEMES[name].label}
                  </button>
                ))}
              </div>
                  <div className="tab-group-label">Piece style</div>
              <div className="overlay-options piece-styles">
                {(Object.keys(PIECE_STYLES) as PieceStyle[]).map((style) => (
                  <button
                    key={style}
                    className={`overlay-toggle${pieceStyle === style ? ' active' : ''}`}
                    onClick={() => setPieceStyle(style)}
                    title={PIECE_STYLES[style].hint}
                  >
                    {PIECE_STYLES[style].icon} {PIECE_STYLES[style].label}
                  </button>
                ))}
              </div>
              {pieceStyle.startsWith('3d') && (
                <div className="board-tilt">The board stays fixed while you play — flip Pan/zoom on the board to turn, pan, and zoom the camera.</div>
              )}
                </>
              )}

              {sidebarTab === 'analysis' && (
                <>
                <AnalysisPanel
                  evalOn={evalOn}
                  onToggleEval={toggleEval}
                >
                  {analysisError && <div className="analysis-error">{analysisError}</div>}
                  <MaiaEvaluations
                    evaluations={evaluations}
                    fen={fen}
                    turn={chess.turn()}
                    view={maiaPanelView}
                    onViewChange={setMaiaPanelView}
                    band={maiaPanelBand}
                    onBandChange={setMaiaPanelBand}
                    moveCount={maiaMoveCount}
                    onMoveCountChange={(next) =>
                      setMaiaMoveCount(Math.max(MAIA_MOVE_COUNT_MIN, Math.min(MAIA_MOVE_COUNT_MAX, next)))
                    }
                    openingsPerMove={openingsPerMove}
                    onOpeningsPerMoveChange={(next) =>
                      setOpeningsPerMove(Math.max(OPENINGS_PER_MOVE_MIN, Math.min(OPENINGS_PER_MOVE_MAX, next)))
                    }
                    loading={analysisLoading}
                    onHoverMove={setHoveredMove}
                    selectedSquare={selectedSquare}
                    historySans={game.plies.slice(0, game.cursor).map((ply) => ply.san)}
                    rowScores={rowScores}
                    sf={sfCurrent}
                  />
                </AnalysisPanel>

                <div className="tab-group-label">Move list</div>
                <MoveList
                  plies={game.plies}
                  cursor={game.cursor}
                  onSelect={(cursor) => setGame((prev) => goTo(prev, cursor))}
                  result={result.over ? result.result : undefined}
                  maiaPercent={(index) => historyMaiaPercent.get(index) ?? null}
                  maiaScore={(index) => historyMaiaScore.get(index) ?? null}
                  maiaLoading={historyMaiaLoading}
                  sfScore={(index) => historySfScore.get(index) ?? null}
                  sfLoading={historySfLoading}
                />
                <button
                  className={`history-maia-toggle${showHistoryMaia ? ' active' : ''}`}
                  onClick={() => setShowHistoryMaia((v) => !v)}
                  title="Ask Maia 2500 what it thinks of each move played — its policy probability and score next to every move in the list"
                >
                  Maia 2500 {showHistoryMaia ? 'on' : 'off'}
                </button>
                <button
                  className={`history-maia-toggle${showHistorySf ? ' active' : ''}`}
                  onClick={() => setShowHistorySf((v) => !v)}
                  title="Evaluate every position in the game with Stockfish (browser build) — its score next to each move"
                >
                  Stockfish {showHistorySf ? 'on' : 'off'}
                </button>
                </>
              )}

              <div className="version">Gambit {__APP_VERSION__}</div>

              <div className="status">
                {thinking && <span className="thinking">{opponentLabel} is thinking…</span>}
                {statusNote && <span className="note">{statusNote}</span>}
                {!thinking && !statusNote && !result.over && (
                  <span className="turn">{chess.turn() === 'w' ? 'White' : 'Black'} to move</span>
                )}
              </div>
          </div>
        </aside>
      </main>
      <Changelog />
    </div>
  )
}

function pgnHeaders(setup: Setup, opponentLabel: string, result: string): Record<string, string> {
  const human = 'Player'
  return {
    Event: 'Gambit local game',
    Site: 'Gambit',
    Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    White: setup.playerColor === 'w' ? human : opponentLabel,
    Black: setup.playerColor === 'w' ? opponentLabel : human,
    Result: result,
    TimeControl: `${setup.timeControl.initialSeconds}+${setup.timeControl.incrementSeconds}`,
  }
}
