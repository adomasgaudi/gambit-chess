import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'

import { Board, type Arrow } from './components/Board'
import { CapturedRow, Clock, EngineLines, EvalBar, MoveList, PromotionDialog } from './components/Panels'
import { GameSetup, type Setup, TIME_CONTROLS } from './components/Setup'
import { Landing, type LandingChoice } from './components/Landing'
import { AnalysisPanel, type EngineSettings } from './components/AnalysisPanel'
import { ToolsMenu } from './components/ToolsMenu'

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
  START_FEN,
  takeback,
  toPgn,
  uciHistory,
  type GameState,
  type PieceRole,
} from './chess/game'
import { findOpening } from './chess/openings'
import { pvToSan, pvToSanList } from './chess/san'
import { classifyMove, fromPov, type MoveQuality } from './chess/quality'
import { analyseLoss, type Insight } from './chess/nature'
import { sleep, thinkingDelayMs } from './chess/thinkTime'
import { Stockfish } from './engines/stockfish'
import { cloudEval } from './engines/cloud'
import { MaiaOffline, maiaHealth, maiaMove } from './engines/maia'
import type { EngineLine, Score, SearchLimit } from './engines/types'
import { playMoveSound, playSound, setSoundEnabled } from './sound'
import './App.css'

type Mode = 'play' | 'analysis'
/** The landing page and the board are the app's two screens. */
type View = 'landing' | 'game'

interface ClockState {
  w: number
  b: number
  /** Epoch ms at which the running side's clock started counting down. */
  since: number | null
  running: 'w' | 'b' | null
}

const UNTIMED = TIME_CONTROLS[TIME_CONTROLS.length - 1]

const DEFAULT_SETUP: Setup = {
  opponent: 'stockfish',
  playerColor: 'w',
  stockfishElo: 1500,
  maiaRating: 1500,
  maiaPace: 'human',
  timeControl: TIME_CONTROLS[2],
}

export default function App() {
  const [view, setView] = useState<View>('landing')
  const [mode, setMode] = useState<Mode>('play')
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const [showSetup, setShowSetup] = useState(true)
  const [game, setGame] = useState<GameState>(() => newGame())
  const [orientation, setOrientation] = useState<'w' | 'b'>('w')
  const [sound, setSound] = useState(true)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [thinking, setThinking] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [maiaOnline, setMaiaOnline] = useState<boolean | null>(null)
  const [resigned, setResigned] = useState<'w' | 'b' | null>(null)
  const [flagged, setFlagged] = useState<'w' | 'b' | null>(null)

  // Two separate Stockfish instances: one plays, one analyses. Sharing one
  // would mean the eval bar and the opponent fighting over the same search.
  const opponentEngine = useRef<Stockfish | null>(null)
  const analysisEngine = useRef<Stockfish | null>(null)
  if (!opponentEngine.current) opponentEngine.current = new Stockfish()
  if (!analysisEngine.current) analysisEngine.current = new Stockfish()

  const [evalOn, setEvalOn] = useState(false)
  const [engineSettings, setEngineSettings] = useState<EngineSettings>({
    multiPv: 3,
    depth: 20,
    threads: 2,
    focusPiece: true,
  })
  const [toolsOpen, setToolsOpen] = useState(false)
  /** The square the player has a piece picked up on, if any. */
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [showDefence, setShowDefence] = useState(false)
  const [lines, setLines] = useState<EngineLine[]>([])
  /** Whether `lines` came from the cloud rather than the local engine. */
  const [fromCloud, setFromCloud] = useState(false)
  const [hoverLine, setHoverLine] = useState<EngineLine | null>(null)
  const [quality, setQuality] = useState<Map<number, MoveQuality>>(new Map())
  /** Tactical vs strategic, for the moves that lost something. */
  const [insights, setInsights] = useState<Map<number, Insight>>(new Map())
  const [evalHistory, setEvalHistory] = useState<Map<number, Score>>(new Map())
  const [reviewProgress, setReviewProgress] = useState<number | null>(null)

  const [clock, setClock] = useState<ClockState>({ w: 0, b: 0, since: null, running: null })
  const [, forceTick] = useState(0)

  const chess = useMemo(() => positionAt(game), [game])
  const fen = chess.fen()
  const atLive = game.cursor === game.plies.length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dests = useMemo(() => legalDests(chess), [fen])

  const result = useMemo(() => {
    const natural = outcome(positionAt(game, game.plies.length))
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
  }, [game, resigned, flagged])

  const engineColor: 'w' | 'b' | null =
    mode === 'play' && setup.opponent !== 'human' ? (setup.playerColor === 'w' ? 'b' : 'w') : null

  const movable: Array<'w' | 'b'> = useMemo(() => {
    if (result.over) return []
    if (mode === 'analysis') return ['w', 'b']
    if (!atLive) return []
    if (setup.opponent === 'human') return ['w', 'b']
    return [setup.playerColor]
  }, [mode, atLive, setup, result.over])

  const lastMove = game.cursor > 0 ? game.plies[game.cursor - 1] : null
  const opening = useMemo(
    () => findOpening(game.plies.slice(0, game.cursor).map((ply) => ply.san)),
    [game],
  )

  useEffect(() => setSoundEnabled(sound), [sound])
  useEffect(() => {
    void maiaHealth().then((health) => setMaiaOnline(health?.ok ?? false))
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
  })

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
      if (mode === 'play') switchClock(ply.color)
    },
    [game, mode, switchClock],
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
    if (mode !== 'play' || !engineColor || result.over || showSetup) return
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
        if (setup.opponent === 'maia') {
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
        } else {
          const engine = opponentEngine.current!
          await engine.setElo(setup.stockfishElo >= 3000 ? null : setup.stockfishElo)
          await engine.setMultiPv(1)
          const movetime = setup.stockfishElo >= 2400 ? 1200 : 400
          const search = await engine.search(liveFen, { movetimeMs: movetime })
          bestmove = search.bestmove
        }
        if (cancelled || token !== moveToken.current) return

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
        if (!cancelled) setThinking(false)
      }
    }

    void think()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFen, mode, engineColor, result.over, showSetup, setup])

  /**
   * The selected piece's legal moves in UCI. Handing these to the engine as
   * `searchmoves` turns "what is the best move here?" into "what is the best
   * thing this piece can do?" — the engine still searches the whole tree, it
   * just only reports lines that start with one of these.
   */
  const focusMoves = useMemo(() => {
    if (!engineSettings.focusPiece || !selectedSquare) return []
    return chess
      .moves({ square: selectedSquare, verbose: true })
      .map((move) => move.from + move.to + (move.promotion ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, selectedSquare, engineSettings.focusPiece])
  // A stable dependency: the array is rebuilt on every render, the string isn't.
  const focusKey = focusMoves.join(' ')

  const focusLabel = useMemo(() => {
    if (!focusKey || !selectedSquare) return null
    const piece = chess.get(selectedSquare)
    if (!piece) return null
    const names: Record<string, string> = {
      p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
    }
    return `the ${names[piece.type]} on ${selectedSquare}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, selectedSquare, fen])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defence = useMemo(() => (showDefence ? defenceMap(chess) : null), [fen, showDefence])

  /**
   * Name the opening an engine line transposes into. The book is keyed on the
   * moves from the start position, so the game so far has to be prepended —
   * and a game set up from a custom FEN has no such history to prepend.
   */
  const gameSans = useMemo(
    () => game.plies.slice(0, game.cursor).map((ply) => ply.san),
    [game],
  )
  const openingForPv = useCallback(
    (pv: string[]) => {
      if (game.startFen !== START_FEN) return null
      const line = findOpening([...gameSans, ...pvToSanList(fen, pv)])
      if (!line) return null
      // Naming the opening the game is already in tells you nothing — the label
      // earns its place only when the variation steers somewhere else.
      return line.name === opening?.name ? null : line
    },
    [game.startFen, gameSans, fen, opening],
  )

  // --------------------------------------------------------- live analysis
  // Keyed on `reviewing`, not on reviewProgress: the percentage changes on
  // every reviewed ply, and re-running this effect would `stop()` the very
  // search the review is waiting on.
  const reviewing = reviewProgress !== null
  useEffect(() => {
    if (!evalOn || reviewing) {
      setLines([])
      return
    }
    const engine = analysisEngine.current!
    let cancelled = false

    const focused = focusKey ? focusKey.split(' ') : []

    void (async () => {
      // Ask the cloud first. A hit is depth 60+ against our depth 20, so there
      // is nothing for the local engine to add and it stays idle. A focused
      // search has to skip it: the cloud answers about the position, and can't
      // be asked to rank one piece's moves.
      if (focused.length === 0) {
        const cloud = await cloudEval(fen)
        if (cancelled) return
        if (cloud) {
          setLines(cloud.lines.slice(0, engineSettings.multiPv))
          setFromCloud(true)
          return
        }
      }
      setFromCloud(false)

      await engine.setThreads(engineSettings.threads)
      // One line per candidate move when focused, so every option this piece
      // has gets its own score rather than only the best few.
      await engine.setMultiPv(
        focused.length > 0 ? Math.min(8, focused.length) : engineSettings.multiPv,
      )
      const limit: SearchLimit =
        engineSettings.depth === 0 ? { infinite: true } : { depth: engineSettings.depth }
      if (focused.length > 0) limit.searchmoves = focused

      const search = await engine.search(fen, limit, {
        onLine: (current) => !cancelled && setLines(current),
      })
      if (!cancelled) setLines(search.lines)
    })()

    return () => {
      cancelled = true
      engine.stop()
    }
  }, [fen, evalOn, reviewing, engineSettings, focusKey])

  const currentScore: Score | null = useMemo(() => {
    if (result.over && game.cursor === game.plies.length) {
      if (result.result === '1-0') return { mate: 1 }
      if (result.result === '0-1') return { mate: -1 }
      return { cp: 0 }
    }
    const live = lines[0]
    if (live) return fromPov(live, chess.turn(), 'w')
    return evalHistory.get(game.cursor) ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, evalHistory, game.cursor, fen, result])

  // -------------------------------------------------------- computer review
  const runReview = useCallback(async () => {
    const engine = analysisEngine.current!
    const total = game.plies.length
    if (total === 0) return

    // Release the live analysis first: if it is running to unlimited depth it
    // will never finish on its own, and everything below queues behind it.
    engine.stop()
    setReviewProgress(0)
    await engine.setMultiPv(1)

    const scores = new Map<number, Score>()
    const bestMoves = new Map<number, string>()
    // Kept per position so a move can be characterised from what happens after
    // it: the refutation the opponent gets, and how deep you had to look.
    const pvs = new Map<number, string[]>()
    const curves = new Map<number, Map<number, Score>>()

    // The opening is where a depth-14 review is least trustworthy and where the
    // cloud is most likely to have an answer, so it gets asked first. Positions
    // only get rarer as a game goes on: once a few in a row have missed, the
    // rest almost certainly will too, and asking anyway is just latency.
    let misses = 0
    const GIVE_UP_AFTER = 4

    for (let i = 0; i <= total; i++) {
      const positionFen = fenAt(game, i)
      const turn = positionFen.split(' ')[1] as 'w' | 'b'

      const cloud = misses < GIVE_UP_AFTER ? await cloudEval(positionFen) : null
      if (cloud) {
        misses = 0
        scores.set(i, fromPov(cloud.lines[0], turn, 'w'))
        bestMoves.set(i, cloud.lines[0].pv[0])
        pvs.set(i, cloud.lines[0].pv)
        // No curve: the API reports one settled depth, not the climb to it.
      } else {
        misses++
        const search = await engine.search(positionFen, { depth: 14 })
        const top = search.lines[0]
        scores.set(i, top ? fromPov(top, turn, 'w') : { cp: 0 })
        bestMoves.set(i, search.bestmove)
        if (top) pvs.set(i, top.pv)
        curves.set(i, search.curve)
      }
      setReviewProgress(Math.round((i / total) * 100))
    }

    const marks = new Map<number, MoveQuality>()
    const insights = new Map<number, Insight>()
    for (let i = 0; i < total; i++) {
      const mover = game.plies[i].color
      const before = fromPov(scores.get(i)!, 'w', mover)
      const after = fromPov(scores.get(i + 1)!, 'w', mover)
      const mark = classifyMove(before, after, bestMoves.get(i) === game.plies[i].uci)
      marks.set(i, mark)

      // Only moves that actually cost something have a kind of loss to name.
      if (mark === 'inaccuracy' || mark === 'mistake' || mark === 'blunder') {
        const insight = analyseLoss({
          fen: fenAt(game, i + 1),
          refutation: pvs.get(i + 1) ?? [],
          curve: curves.get(i + 1) ?? null,
          mover,
        })
        if (insight) insights.set(i, insight)
      }
    }

    setEvalHistory(scores)
    setQuality(marks)
    setInsights(insights)
    setReviewProgress(null)
    setEvalOn(true)
  }, [game])

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
      else if (event.key === 'f') setOrientation((o) => (o === 'w' ? 'b' : 'w'))
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  // ------------------------------------------------------------- new game
  /**
   * A landing card picks the kind of game but not its settings: play modes
   * hand off to the options panel, while the analysis board has nothing left
   * to configure and opens straight away.
   */
  const chooseFromLanding = useCallback((choice: LandingChoice) => {
    setView('game')
    setStatusNote('')

    if (choice !== 'analysis') {
      setMode('play')
      setSetup((prev) => ({ ...prev, opponent: choice }))
      setShowSetup(true)
      return
    }

    setMode('analysis')
    setShowSetup(false)
    setGame(newGame())
    setOrientation('w')
    setQuality(new Map())
    setEvalHistory(new Map())
    setLines([])
    setResigned(null)
    setFlagged(null)
    setEvalOn(true)
    // An analysis board has no opponent and no clock to run down.
    setSetup((prev) => ({ ...prev, timeControl: UNTIMED }))
    setClock({ w: 0, b: 0, since: null, running: null })
    void analysisEngine.current?.newGame()
  }, [])

  const startGame = useCallback((next: Setup) => {
    setSetup(next)
    setView('game')
    setShowSetup(false)
    setGame(newGame())
    setOrientation(next.playerColor)
    setQuality(new Map())
    setEvalHistory(new Map())
    setLines([])
    setResigned(null)
    setFlagged(null)
    setStatusNote('')
    setMode('play')
    const ms = next.timeControl.initialSeconds * 1000
    setClock({ w: ms, b: ms, since: ms > 0 ? Date.now() : null, running: ms > 0 ? 'w' : null })
    void opponentEngine.current?.newGame()
    void analysisEngine.current?.newGame()
  }, [])

  const doTakeback = useCallback(() => {
    // Take back the player's move together with the engine's reply, so that it
    // is the player's turn again rather than the engine's.
    const last = game.plies[game.plies.length - 1]
    const plies = engineColor && last?.color === engineColor ? 2 : 1
    moveToken.current++
    setGame((prev) => takeback(prev, plies))
  }, [engineColor, game.plies])

  const copy = useCallback((text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setStatusNote(`${what} copied to clipboard`),
      () => setStatusNote(`Could not copy ${what}`),
    )
  }, [])

  const loadFen = useCallback(() => {
    const input = window.prompt('Paste a FEN to analyse:')
    if (!input) return
    try {
      new Chess(input.trim())
    } catch {
      setStatusNote('That FEN is not valid')
      return
    }
    setGame(newGame(input.trim()))
    setQuality(new Map())
    setEvalHistory(new Map())
    setResigned(null)
    setFlagged(null)
    setMode('analysis')
    setStatusNote('Position loaded')
  }, [])

  // -------------------------------------------------------------- render
  const arrows: Arrow[] = useMemo(() => {
    const source = hoverLine ?? (evalOn ? lines[0] : null)
    if (!source?.pv?.length) return []
    const [first] = source.pv
    return [{ from: first.slice(0, 2) as Square, to: first.slice(2, 4) as Square }]
  }, [hoverLine, lines, evalOn])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const captured = useMemo(() => capturedPieces(chess), [fen])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const balance = useMemo(() => materialBalance(chess), [fen])

  const opponentLabel =
    setup.opponent === 'human'
      ? 'Human'
      : setup.opponent === 'maia'
        ? `Maia ${setup.maiaRating}`
        : `Stockfish ${setup.stockfishElo >= 3000 ? 'full' : setup.stockfishElo}`

  const topColor: 'w' | 'b' = orientation === 'w' ? 'b' : 'w'
  const bottomColor: 'w' | 'b' = orientation

  const nameFor = (color: 'w' | 'b'): string => {
    if (mode === 'analysis' || setup.opponent === 'human') return color === 'w' ? 'White' : 'Black'
    return color === setup.playerColor ? 'You' : opponentLabel
  }

  // With the options panel open and no game yet, there is no clock to show:
  // the time control isn't settled until Start, and a frozen 0:00 reads as a
  // player who has already flagged.
  const preGame = showSetup && game.plies.length === 0

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
    </div>
    )
  }

  if (view === 'landing') {
    return (
      <Landing
        maiaOnline={maiaOnline}
        hasGameInProgress={game.plies.length > 0 && !result.over}
        onChoose={chooseFromLanding}
        onResume={() => setView('game')}
      />
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView('landing')} title="Back to the home page">
          <span className="brand-mark">♞</span> Gambit
        </button>
        <nav className="tabs">
          <button className={mode === 'play' ? 'active' : ''} onClick={() => setMode('play')}>
            Play
          </button>
          <button className={mode === 'analysis' ? 'active' : ''} onClick={() => setMode('analysis')}>
            Analysis
          </button>
        </nav>
        <div className="topbar-right">
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
          {(evalOn || mode === 'analysis') && <EvalBar score={currentScore} orientation={orientation} />}

          <div className="board-stack">
            {strip(topColor)}

            <div className="board-wrap">
              <Board
                chess={chess}
                orientation={orientation}
                movable={movable}
                lastMove={lastMove}
                checkSquare={findCheckSquare(chess)}
                dests={dests}
                arrows={arrows}
                onMove={handleBoardMove}
                onSelectChange={setSelectedSquare}
                defence={defence}
              />
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
          {showSetup ? (
            <GameSetup
              initial={setup}
              maiaOnline={maiaOnline}
              onStart={startGame}
              // With a game already on the board, cancelling goes back to it;
              // otherwise there is nothing behind the panel but the landing page.
              onCancel={game.plies.length > 0 ? () => setShowSetup(false) : () => setView('landing')}
              cancelLabel={game.plies.length > 0 ? 'Cancel' : 'Back'}
            />
          ) : (
            <>
              <div className="panel-head">
                <span className="panel-title">
                  {mode === 'analysis'
                    ? 'Analysis board'
                    : setup.opponent === 'human'
                      ? 'Two players'
                      : `vs ${opponentLabel}`}
                </span>
                <span className="panel-sub">
                  {opening ? `${opening.eco} · ${opening.name}` : setup.timeControl.label}
                </span>
              </div>

              <MoveList
                plies={game.plies}
                cursor={game.cursor}
                quality={quality}
                insights={insights}
                onSelect={(cursor) => setGame((prev) => goTo(prev, cursor))}
                result={result.over ? result.result : undefined}
              />

              <div className="navrow">
                <button onClick={() => navigate('start')} title="Start (↑)">⏮</button>
                <button onClick={() => navigate(-1)} title="Back (←)">◀</button>
                <button onClick={() => navigate(1)} title="Forward (→)">▶</button>
                <button onClick={() => navigate('end')} title="End (↓)">⏭</button>
                <button onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} title="Flip (f)">⇅</button>
              </div>

              <button
                className={`overlay-toggle${showDefence ? ' active' : ''}`}
                onClick={() => setShowDefence((v) => !v)}
                title="Show how many pieces defend and attack each square"
              >
                🛡 Defenders {showDefence ? 'on' : 'off'}
              </button>

              <AnalysisPanel
                evalOn={evalOn}
                onToggleEval={() => setEvalOn((value) => !value)}
                reviewProgress={reviewProgress}
                onReview={() => void runReview()}
                canReview={game.plies.length > 0}
                settings={engineSettings}
                onSettings={(changes) => setEngineSettings((prev) => ({ ...prev, ...changes }))}
                maxThreads={analysisEngine.current?.maxThreads ?? 0}
                engineName={analysisEngine.current?.name ?? 'Stockfish'}
                focusLabel={focusLabel}
                stats={
                  lines[0]
                    ? {
                        depth: lines[0].depth,
                        nodes: lines[0].nodes,
                        nps: lines[0].nps,
                        cloud: fromCloud,
                      }
                    : null
                }
              >
                <EngineLines
                  lines={lines}
                  turn={chess.turn()}
                  onHover={setHoverLine}
                  sanForLine={(pv) => pvToSan(fen, pv)}
                  openingForLine={openingForPv}
                />
              </AnalysisPanel>

              <div className="actions">
                <button onClick={() => setShowSetup(true)}>New game</button>
                <button onClick={doTakeback} disabled={game.plies.length === 0 || mode !== 'play'}>
                  Takeback
                </button>
                <button
                  onClick={() => {
                    setResigned(setup.playerColor)
                    playSound('end')
                  }}
                  disabled={mode !== 'play' || result.over || setup.opponent === 'human'}
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
                          onSelect: () =>
                            copy(toPgn(game, pgnHeaders(setup, opponentLabel, result.result)), 'PGN'),
                        },
                        { label: 'Copy FEN', onSelect: () => copy(fen, 'FEN') },
                        { label: 'Load FEN…', onSelect: loadFen },
                        {
                          label: 'Flip board',
                          divider: true,
                          onSelect: () => setOrientation((o) => (o === 'w' ? 'b' : 'w')),
                        },
                        { label: sound ? 'Mute sound' : 'Unmute sound', onSelect: () => setSound((s) => !s) },
                      ]}
                    />
                  )}
                </div>
              </div>

              <div className="version">Gambit v{__APP_VERSION__}</div>

              <div className="status">
                {thinking && <span className="thinking">{opponentLabel} is thinking…</span>}
                {statusNote && <span className="note">{statusNote}</span>}
                {!thinking && !statusNote && !result.over && (
                  <span className="turn">{chess.turn() === 'w' ? 'White' : 'Black'} to move</span>
                )}
              </div>
            </>
          )}
        </aside>
      </main>
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
