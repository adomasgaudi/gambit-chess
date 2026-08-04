/** The game model: a mainline of plies plus a cursor into it. */

import { Chess, type Square } from 'chess.js'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export type PieceRole = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export interface Ply {
  san: string
  uci: string
  from: Square
  to: Square
  color: 'w' | 'b'
  piece: PieceRole
  captured?: PieceRole
  promotion?: PieceRole
  /** Position before the move was played. */
  fenBefore: string
  fenAfter: string
  check: boolean
  checkmate: boolean
  /** Full-move number this ply belongs to. */
  moveNumber: number
}

export interface GameState {
  startFen: string
  plies: Ply[]
  /** 0 = start position; n = position after plies[n-1]. */
  cursor: number
}

export type GameResult = {
  over: boolean
  /** '1-0' | '0-1' | '1/2-1/2' | '*' */
  result: string
  reason: string
}

export function newGame(startFen = START_FEN): GameState {
  return { startFen, plies: [], cursor: 0 }
}

/** A chess.js instance for the position at the cursor. */
export function positionAt(state: GameState, cursor = state.cursor): Chess {
  const chess = new Chess(state.startFen)
  for (let i = 0; i < cursor; i++) chess.move(state.plies[i].san)
  return chess
}

export function fenAt(state: GameState, cursor = state.cursor): string {
  return cursor === 0 ? state.startFen : state.plies[cursor - 1].fenAfter
}

/** UCI moves from the start position up to the cursor — what lc0 wants. */
export function uciHistory(state: GameState, cursor = state.cursor): string[] {
  return state.plies.slice(0, cursor).map((ply) => ply.uci)
}

export interface MoveInput {
  from: Square
  to: Square
  promotion?: PieceRole
}

/**
 * Play a move at the cursor. Anything after the cursor is discarded, which is
 * what makes taking a move back and trying another one work.
 */
export function applyMove(state: GameState, input: MoveInput): GameState | null {
  const chess = positionAt(state)
  const fenBefore = chess.fen()
  const moveNumber = Number(fenBefore.split(' ')[5])

  let move
  try {
    move = chess.move({ from: input.from, to: input.to, promotion: input.promotion ?? 'q' })
  } catch {
    return null
  }
  if (!move) return null

  const ply: Ply = {
    san: move.san,
    uci: move.from + move.to + (move.promotion ?? ''),
    from: move.from,
    to: move.to,
    color: move.color,
    piece: move.piece as PieceRole,
    captured: move.captured as PieceRole | undefined,
    promotion: move.promotion as PieceRole | undefined,
    fenBefore,
    fenAfter: chess.fen(),
    check: chess.isCheck(),
    checkmate: chess.isCheckmate(),
    moveNumber,
  }

  const plies = [...state.plies.slice(0, state.cursor), ply]
  return { ...state, plies, cursor: plies.length }
}

/** Play a move given in UCI (`e2e4`, `e7e8q`) — the form both engines speak. */
export function applyUci(state: GameState, uci: string): GameState | null {
  if (uci.length < 4) return null
  return applyMove(state, {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci.length > 4 ? uci[4] : undefined) as PieceRole | undefined,
  })
}

/**
 * Append a move to the end of the mainline, wherever the cursor happens to be.
 * This is how the engine moves: the player browsing back through the game must
 * not truncate the line the engine is still playing on. The cursor follows the
 * new move only if it was already at the end.
 */
export function appendUci(state: GameState, uci: string): GameState | null {
  const wasAtEnd = state.cursor === state.plies.length
  const atEnd = applyUci({ ...state, cursor: state.plies.length }, uci)
  if (!atEnd) return null
  return { ...atEnd, cursor: wasAtEnd ? atEnd.plies.length : state.cursor }
}

/** Drop the last full move pair (or single ply if the opponent hasn't replied). */
export function takeback(state: GameState, plies = 1): GameState {
  const end = Math.max(0, state.plies.length - plies)
  return { ...state, plies: state.plies.slice(0, end), cursor: Math.min(state.cursor, end) }
}

export function goTo(state: GameState, cursor: number): GameState {
  return { ...state, cursor: Math.max(0, Math.min(state.plies.length, cursor)) }
}

export function outcome(chess: Chess): GameResult {
  if (!chess.isGameOver()) return { over: false, result: '*', reason: '' }
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White'
    return { over: true, result: chess.turn() === 'w' ? '0-1' : '1-0', reason: `Checkmate — ${winner} wins` }
  }
  if (chess.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'Stalemate' }
  if (chess.isInsufficientMaterial())
    return { over: true, result: '1/2-1/2', reason: 'Draw — insufficient material' }
  if (chess.isThreefoldRepetition())
    return { over: true, result: '1/2-1/2', reason: 'Draw — threefold repetition' }
  if (chess.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', reason: 'Draw — fifty-move rule' }
  return { over: true, result: '1/2-1/2', reason: 'Draw' }
}

/**
 * Legal destinations per origin square, for move dots and drag validation.
 * Destinations are deduplicated: a pawn reaching the last rank is four legal
 * moves but only one square to draw a dot on.
 */
export function legalDests(chess: Chess): Map<Square, Square[]> {
  const dests = new Map<Square, Set<Square>>()
  for (const move of chess.moves({ verbose: true })) {
    const set = dests.get(move.from)
    if (set) set.add(move.to)
    else dests.set(move.from, new Set([move.to]))
  }
  return new Map([...dests].map(([from, tos]) => [from, [...tos]]))
}

export interface Defence {
  square: Square
  /** Friendly pieces that could recapture on this square. */
  defenders: number
  /** Enemy pieces attacking it. */
  attackers: number
}

/**
 * How well defended every occupied square is.
 *
 * This counts bodies, not value — two pawns defending a queen is "2", which is
 * the number you want when deciding whether a capture leaves you a piece down,
 * but it says nothing about the trade being good. Squares where the attackers
 * outnumber the defenders are the ones worth looking at.
 */
export function defenceMap(chess: Chess): Defence[] {
  const out: Defence[] = []
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue
      const enemy = piece.color === 'w' ? 'b' : 'w'
      out.push({
        square: piece.square,
        defenders: chess.attackers(piece.square, piece.color).length,
        attackers: chess.attackers(piece.square, enemy).length,
      })
    }
  }
  return out
}

/** The king square of the side to move, when it is in check. */
export function checkSquare(chess: Chess): Square | null {
  if (!chess.isCheck()) return null
  const turn = chess.turn()
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type === 'k' && piece.color === turn) return piece.square
    }
  }
  return null
}

/** True when moving `from`→`to` needs the player to choose a promotion piece. */
export function isPromotion(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from)
  if (!piece || piece.type !== 'p') return false
  const rank = to[1]
  return (piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1')
}

export function toPgn(state: GameState, headers: Record<string, string> = {}): string {
  const chess = positionAt(state, state.plies.length)
  for (const [key, value] of Object.entries(headers)) chess.setHeader(key, value)
  return chess.pgn({ maxWidth: 80, newline: '\n' })
}

/** Material balance in pawns, positive for White. Used by the captured-piece row. */
const VALUES: Record<PieceRole, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export function materialBalance(chess: Chess): number {
  let balance = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue
      balance += (piece.color === 'w' ? 1 : -1) * VALUES[piece.type as PieceRole]
    }
  }
  return balance
}

/** Pieces each side has captured, derived from the board rather than the history. */
export function capturedPieces(chess: Chess): { w: PieceRole[]; b: PieceRole[] } {
  const full: Record<PieceRole, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
  const alive = { w: { ...full }, b: { ...full } }
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece) alive[piece.color][piece.type as PieceRole] -= 1
    }
  }
  const missing = (color: 'w' | 'b'): PieceRole[] => {
    const out: PieceRole[] = []
    for (const role of ['q', 'r', 'b', 'n', 'p'] as PieceRole[]) {
      for (let i = 0; i < Math.max(0, alive[color][role]); i++) out.push(role)
    }
    return out
  }
  // What White captured is what Black is missing.
  return { w: missing('b'), b: missing('w') }
}
