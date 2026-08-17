import { formatPercent, formatScore, scoreToWhiteShare, type Score, type UciMove } from '../engines/types'
import {
  MAIA_MOVE_COUNT_MAX,
  MAIA_MOVE_COUNT_MIN,
  MAIA_RATINGS,
  maiaValueToScore,
  type MaiaEvaluation,
  type MaiaPanelView,
} from '../engines/maia'
import { uciToSan } from '../chess/san'
import { findOpenings, OPENINGS_PER_MOVE_MAX, OPENINGS_PER_MOVE_MIN } from '../chess/openings'
import type { Square } from 'chess.js'
import './MaiaEvaluations.css'

/** Everything the two views need to draw a move and report hovering on it. */
interface MoveContext {
  fen: string
  onHoverMove?: (move: UciMove | null) => void
}

/** Per-move extras for the move lists, keyed by UCI. */
export interface RowScores {
  maia: Score | null
  sf: Score | null
}

/** The live Stockfish read on the position shown: its score and best move. */
export interface SfCurrent {
  score: Score | null
  bestmove: UciMove | null
  loading: boolean
}

export function MaiaEvaluations({
  evaluations,
  fen,
  turn,
  view,
  onViewChange,
  band,
  onBandChange,
  moveCount,
  onMoveCountChange,
  openingsPerMove,
  onOpeningsPerMoveChange,
  loading,
  onHoverMove,
  selectedSquare,
  historySans,
  rowScores,
  sf,
}: {
  evaluations: MaiaEvaluation[]
  fen: string
  turn: 'w' | 'b'
  /** Compare all five bands, or list one band's top moves. */
  view: MaiaPanelView
  onViewChange: (view: MaiaPanelView) => void
  band: number
  onBandChange: (band: number) => void
  moveCount: number
  onMoveCountChange: (count: number) => void
  /** How many openings each move row nests beneath itself. */
  openingsPerMove: number
  onOpeningsPerMoveChange: (count: number) => void
  loading: boolean
  /** Called with the move under the cursor, or null when nothing is hovered. */
  onHoverMove?: (move: UciMove | null) => void
  /** A square picked on the board; its piece's top moves get their own list. */
  selectedSquare?: Square | null
  /** The SANs of the moves already played, so each candidate can name its opening. */
  historySans: string[]
  /** What the position after each candidate move is worth, per Maia and Stockfish. */
  rowScores?: Map<UciMove, RowScores>
  /** The live Stockfish read on the position shown, drawn as a card of its own. */
  sf?: SfCurrent
}) {
  const selected = evaluations.find((evaluation) => evaluation.rating === band)
  /** The band the footer's totals come from: the picked band, else the 1500 reference. */
  const footerEvaluation = selected ?? evaluations.find((evaluation) => evaluation.rating === 1500) ?? evaluations[0]

  return (
    <div className="maia-analysis">
      <div className="maia-analysis-toolbar">
        <div className="maia-view-toggle" role="group" aria-label="Maia panel view">
          <button className={view === 'bands' ? 'active' : ''} onClick={() => onViewChange('bands')}>
            Five bands
          </button>
          <button className={view === 'moves' ? 'active' : ''} onClick={() => onViewChange('moves')}>
            One band
          </button>
        </div>
        <span className="maia-analysis-label">
          {view === 'bands' ? 'chance · score' : 'chance · after-move scores'}
        </span>
      </div>

      {sf && (
        <StockfishCard
          score={sf.score}
          bestmove={sf.bestmove}
          loading={sf.loading}
          fen={fen}
          onHoverMove={onHoverMove}
        />
      )}

      {view === 'moves' && (
        <>
        <div className="maia-band-controls">
          <div className="maia-band-chips" role="group" aria-label="Maia rating band">
            {MAIA_RATINGS.map((rating) => (
              <button
                key={rating}
                className={rating === band ? 'active' : ''}
                onClick={() => onBandChange(rating)}
              >
                {rating}
              </button>
            ))}
          </div>
          <div className="maia-move-count">
            <button
              onClick={() => onMoveCountChange(moveCount - 1)}
              disabled={moveCount <= MAIA_MOVE_COUNT_MIN}
              aria-label="Show fewer moves"
            >
              −
            </button>
            <span>{moveCount} moves</span>
            <button
              onClick={() => onMoveCountChange(moveCount + 1)}
              disabled={moveCount >= MAIA_MOVE_COUNT_MAX}
              aria-label="Show more moves"
            >
              +
            </button>
          </div>
        </div>
        <div className="maia-band-controls">
          <span className="maia-analysis-label">openings per move</span>
          <div className="maia-move-count">
            <button
              onClick={() => onOpeningsPerMoveChange(openingsPerMove - 1)}
              disabled={openingsPerMove <= OPENINGS_PER_MOVE_MIN}
              aria-label="Show fewer openings per move"
            >
              −
            </button>
            <span>{openingsPerMove === 0 ? 'off' : openingsPerMove}</span>
            <button
              onClick={() => onOpeningsPerMoveChange(openingsPerMove + 1)}
              disabled={openingsPerMove >= OPENINGS_PER_MOVE_MAX}
              aria-label="Show more openings per move"
            >
              +
            </button>
          </div>
        </div>
        </>
      )}

      {loading && evaluations.length === 0 && <div className="lines-empty">Maia is reading the position…</div>}
      {!loading && evaluations.length === 0 && <div className="lines-empty">Maia idle</div>}

      {/* Clearing happens once, on leaving the whole list, so moving between
          two moves never flickers the board arrow. */}
      <div className="maia-evaluation-list" onMouseLeave={() => onHoverMove?.(null)}>
            {view === 'bands'
              ? evaluations.map((evaluation) => (
                  <MaiaCard
                    key={evaluation.rating}
                    evaluation={evaluation}
                    turn={turn}
                    fen={fen}
                    onHoverMove={onHoverMove}
                  />
                ))
              : selected && (
                  <MaiaMoveList
                    evaluation={selected}
                    turn={turn}
                    count={moveCount}
                    fen={fen}
                    historySans={historySans}
                    rowScores={rowScores}
                    openingsPerMove={openingsPerMove}
                    onHoverMove={onHoverMove}
                  />
                )}
          </div>

        {view === 'moves' && selected && selectedSquare && (
          <PieceMoveList
            evaluation={selected}
            fen={fen}
            square={selectedSquare}
            count={moveCount}
            historySans={historySans}
            rowScores={rowScores}
            openingsPerMove={openingsPerMove}
            onHoverMove={onHoverMove}
          />
        )}

      {footerEvaluation && footerEvaluation.all.length > 0 && (
        <div className="maia-panel-footer">
          <span>{footerEvaluation.all.length} legal moves</span>
          {footerEvaluation.all.length > 1 && (
            <span className="maia-worst-move">
              worst{' '}
              <MoveChip
                move={footerEvaluation.all[footerEvaluation.all.length - 1].move}
                probability={footerEvaluation.all[footerEvaluation.all.length - 1].probability}
                fen={fen}
                onHoverMove={onHoverMove}
              />
            </span>
          )}
        </div>
      )}

      {loading && evaluations.length > 0 && <div className="maia-refreshing">Updating the five Maia views…</div>}
    </div>
  )
}

/** Stockfish's live read on the position shown: white-POV score and best move. */
function StockfishCard({
  score,
  bestmove,
  loading,
  fen,
  onHoverMove,
}: {
  score: Score | null
  bestmove: UciMove | null
  loading: boolean
  fen: string
  onHoverMove?: (move: UciMove | null) => void
}) {
  const positive = score ? scoreToWhiteShare(score) >= 0.5 : null
  const state = positive === null ? '' : positive ? ' pos' : ' neg'
  return (
    <div className="maia-evaluation-card sf-card" title="Stockfish (browser build) on the current position">
      <div className={`sf-primary-value${state}${!score && !loading ? ' empty' : ''}`}>
        {score ? formatScore(score) : loading ? '…' : '—'}
      </div>
      <div className="maia-card-body">
        <div className="maia-card-heading">Stockfish</div>
        <div className="maia-best-move">
          {bestmove ? (
            <MoveChip move={bestmove} fen={fen} onHoverMove={onHoverMove} />
          ) : (
            <span className="sf-best-placeholder">{loading ? 'reading…' : '—'}</span>
          )}
          {!loading && <span>depth 10</span>}
        </div>
      </div>
    </div>
  )
}

/** One rating band: its move chance and its score, side by side. */
function MaiaCard({
  evaluation,
  turn,
  fen,
  onHoverMove,
}: {
  evaluation: MaiaEvaluation
  turn: 'w' | 'b'
} & MoveContext) {
  const score = maiaValueToScore(evaluation.value, turn)
  const positive = scoreToWhiteShare(score) >= 0.5
  const candidates = evaluation.candidates.slice(0, 4)

  return (
    <div className="maia-evaluation-card" title={`Official Maia ${evaluation.modelRating} policy, calibrated for the ${evaluation.rating} band`}>
      <div className={`maia-primary-value ${positive ? 'pos' : 'neg'}`}>
        <div className="maia-primary-chance">{formatPercent(evaluation.probability)}</div>
        <div className="maia-primary-score">{formatScore(score)}</div>
      </div>
      <div className="maia-card-body">
        <div className="maia-card-heading">Maia {evaluation.rating}</div>
        <div className="maia-best-move">
          <MoveChip move={evaluation.bestmove} fen={fen} onHoverMove={onHoverMove} />
          <span>
            {formatPercent(evaluation.probability)} · {formatScore(score)}
          </span>
        </div>
        <div className="maia-candidates">
          {candidates.length === 0 && 'No policy candidates returned'}
          {candidates.map((candidate, i) => (
            <span key={candidate.move}>
              {i > 0 && <span className="maia-candidate-sep"> · </span>}
              <MoveChip
                move={candidate.move}
                probability={candidate.probability}
                fen={fen}
                onHoverMove={onHoverMove}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** One ranked move row with its nested openings, its after-move Maia score,
    and its after-move Stockfish score. Shared by the all-pieces and piece-only
    lists. */
function MaiaMoveRow({
  rank,
  move,
  probability,
  topProbability,
  fen,
  historySans,
  rowScores,
  openingsPerMove,
  onHoverMove,
}: {
  rank: number
  move: UciMove
  probability: number
  /** The list's top probability, so bars share one scale. */
  topProbability: number
} & MoveContext & { historySans: string[]; rowScores?: Map<UciMove, RowScores>; openingsPerMove: number }) {
  const san = uciToSan(fen, move)
  // Openings already reached by the played history need no repetition on every
  // row — they sit in the strip above the list. Only what this move adds on
  // top of them is worth a row here.
  const lockedNames = new Set(findOpenings(historySans).map((opening) => opening.name))
  const openings =
    openingsPerMove > 0
      ? findOpenings([...historySans, san])
          .filter((opening) => !lockedNames.has(opening.name))
          .slice(0, openingsPerMove)
      : []
  const scores = rowScores?.get(move)

  return (
    <div className="maia-move-row" onMouseEnter={() => onHoverMove?.(move)}>
      <span className="maia-move-rank">{rank}</span>
      <MoveChip move={move} fen={fen} onHoverMove={onHoverMove} />
      <span className="maia-move-bar">
        <span style={{ width: `${Math.max(2, (probability / topProbability) * 100)}%` }} />
      </span>
      <span className="maia-move-percent">{formatPercent(probability)}</span>
      {scores?.maia && <span className="maia-move-score">{formatScore(scores.maia)}</span>}
      {scores?.sf && <span className="maia-move-sf">SF {formatScore(scores.sf)}</span>}
      {openings.length > 0 && (
        <span className="maia-move-openings">
          {openings.map((opening, i) => (
            <span key={i} className="maia-move-opening" title={`${opening.eco} · ${opening.name}`}>
              <span className="maia-move-opening-eco">{opening.eco}</span>
              {opening.name}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

/** The opening chain the played history has already locked in — a reminder of
    what every row below builds on, instead of repeating it per move. */
function LockedInOpenings({ historySans, count }: { historySans: string[]; count: number }) {
  if (count <= 0) return null
  const openings = findOpenings(historySans)
  if (openings.length === 0) return null
  return (
    <div className="maia-locked-openings" title="The opening already reached — the rows below only show what each move adds">
      <span className="maia-locked-label">in</span>
      {openings.slice(0, count).map((opening, i) => (
        <span key={i} className="maia-move-opening">
          <span className="maia-move-opening-eco">{opening.eco}</span>
          {opening.name}
        </span>
      ))}
    </div>
  )
}

/** The chosen band alone, ranked, one row per move. */
function MaiaMoveList({
  evaluation,
  turn,
  count,
  fen,
  historySans,
  rowScores,
  openingsPerMove,
  onHoverMove,
}: {
  evaluation: MaiaEvaluation
  turn: 'w' | 'b'
  count: number
  historySans: string[]
  rowScores?: Map<UciMove, RowScores>
  openingsPerMove: number
} & MoveContext) {
  const moves = evaluation.candidates.slice(0, count)
  if (moves.length === 0) return <div className="lines-empty">No policy candidates returned</div>

  // Bars are scaled against the top move rather than 100%, so a position where
  // every move is unlikely still reads as a ranking.
  const top = moves[0].probability || 1

  return (
    <div
      className="maia-move-rows"
      title={`Official Maia ${evaluation.modelRating} policy, calibrated for the ${evaluation.rating} band`}
    >
      <div className="maia-move-rows-heading">
        Maia {evaluation.rating} · {formatScore(maiaValueToScore(evaluation.value, turn))}
      </div>
      <LockedInOpenings historySans={historySans} count={openingsPerMove} />
      {moves.map((candidate, i) => (
        <MaiaMoveRow
          key={candidate.move}
          rank={i + 1}
          move={candidate.move}
          probability={candidate.probability}
          topProbability={top}
          fen={fen}
          historySans={historySans}
          rowScores={rowScores}
          openingsPerMove={openingsPerMove}
          onHoverMove={onHoverMove}
        />
      ))}
    </div>
  )
}

/**
 * The picked piece alone: the same ranked rows, filtered to moves that start
 * on that square. The all-pieces list above stays untouched.
 */
function PieceMoveList({
  evaluation,
  fen,
  square,
  count,
  historySans,
  rowScores,
  openingsPerMove,
  onHoverMove,
}: {
  evaluation: MaiaEvaluation
  fen: string
  square: Square
  count: number
  historySans: string[]
  rowScores?: Map<UciMove, RowScores>
  openingsPerMove: number
} & MoveContext) {
  const moves = evaluation.all.filter((candidate) => candidate.move.slice(0, 2) === square).slice(0, count)
  const label = pieceLabelAt(fen, square)

  return (
    <div className="maia-piece-rows">
      <div className="maia-move-rows-heading">
        {label ? `${label} — ` : ''}moves only
      </div>
      <LockedInOpenings historySans={historySans} count={openingsPerMove} />
      {moves.length === 0 ? (
        <div className="lines-empty">No policy moves for this piece</div>
      ) : (
        moves.map((candidate, i) => (
          <MaiaMoveRow
            key={candidate.move}
            rank={i + 1}
            move={candidate.move}
            probability={candidate.probability}
            topProbability={moves[0].probability || 1}
            fen={fen}
            historySans={historySans}
            rowScores={rowScores}
            openingsPerMove={openingsPerMove}
            onHoverMove={onHoverMove}
          />
        ))
      )}
    </div>
  )
}

/** The piece standing on a square, named from the FEN, e.g. "White knight on g1". */
function pieceLabelAt(fen: string, square: Square): string | null {
  const board = fen.split(' ')[0]
  const rank = Number(square[1])
  const row = board.split('/')[8 - rank]
  if (!row) return null
  let fileIndex = 0
  for (const char of row) {
    if (/\d/.test(char)) {
      fileIndex += Number(char)
      continue
    }
    if (fileIndex === square.charCodeAt(0) - 97) {
      const names: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
      const white = char === char.toUpperCase()
      return `${white ? 'White' : 'Black'} ${names[char.toLowerCase()]}`
    }
    fileIndex += 1
  }
  return null
}

/** A move that draws itself on the board while hovered or focused. */
function MoveChip({
  move,
  probability,
  fen,
  onHoverMove,
}: { move: UciMove; probability?: number } & MoveContext) {
  return (
    <span
      className="maia-move"
      tabIndex={0}
      onMouseEnter={() => onHoverMove?.(move)}
      onFocus={() => onHoverMove?.(move)}
    >
      {uciToSan(fen, move)}
      {probability !== undefined && ` ${formatPercent(probability)}`}
    </span>
  )
}
