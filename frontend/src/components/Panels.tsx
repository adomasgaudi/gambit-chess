/** The pieces of chrome around the board: clocks, move list, and eval bar. */

import { useEffect, useRef } from 'react'
import type { Square } from 'chess.js'
import type { PieceRole, Ply } from '../chess/game'
import { findOpening } from '../chess/openings'
import type { Score } from '../engines/types'
import { formatPercent, formatScore, scoreToWhiteShare } from '../engines/types'
import './Panels.css'

// ---------------------------------------------------------------- promotion

export function PromotionDialog({
  color,
  square,
  orientation,
  onPick,
  onCancel,
}: {
  color: 'w' | 'b'
  square: Square
  orientation: 'w' | 'b'
  onPick: (role: PieceRole) => void
  onCancel: () => void
}) {
  const file = square.charCodeAt(0) - 97
  const column = orientation === 'w' ? file : 7 - file
  // The strip grows downward from the promotion rank when it's at the top of
  // the board, upward when the board is flipped.
  const fromTop = (color === 'w') === (orientation === 'w')

  return (
    <div className="promotion-veil" onClick={onCancel}>
      <div
        className="promotion-strip"
        style={{
          left: `${column * 12.5}%`,
          [fromTop ? 'top' : 'bottom']: 0,
          flexDirection: fromTop ? 'column' : 'column-reverse',
        }}
      >
        {(['q', 'n', 'r', 'b'] as PieceRole[]).map((role) => (
          <button
            key={role}
            className="promotion-choice"
            onClick={(event) => {
              event.stopPropagation()
              onPick(role)
            }}
          >
            <img src={`/piece/${color}${role.toUpperCase()}.svg`} alt={role} />
          </button>
        ))}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- clock

export function Clock({
  ms,
  active,
  label,
  sub,
}: {
  ms: number | null
  active: boolean
  label: string
  sub?: string
}) {
  const low = ms !== null && ms < 20_000
  return (
    <div className={`clock-row${active ? ' active' : ''}`}>
      <div className="clock-who">
        <span className="clock-name">{label}</span>
        {sub && <span className="clock-sub">{sub}</span>}
      </div>
      {ms !== null && <div className={`clock-time${low ? ' low' : ''}`}>{formatClock(ms)}</div>}
    </div>
  )
}

export function formatClock(ms: number): string {
  const total = Math.max(0, ms)
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  if (total < 20_000) {
    const tenths = Math.floor((total % 1000) / 100)
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// ---------------------------------------------------------------- move list

export function MoveList({
  plies,
  cursor,
  onSelect,
  result,
  maiaPercent,
  maiaScore,
  maiaLoading,
  sfScore,
  sfLoading,
}: {
  plies: Ply[]
  cursor: number
  onSelect: (cursor: number) => void
  result?: string
  /** Probability (0-1) that Maia 2500 would play the move at this ply, or null if unknown. */
  maiaPercent?: (index: number) => number | null
  /** Maia 2500's root score (white POV) at this ply's position, or null. */
  maiaScore?: (index: number) => Score | null
  /** Whether the per-move Maia figures are still being fetched. */
  maiaLoading?: boolean
  /** Stockfish's evaluation (white POV) of this ply's position, or null. */
  sfScore?: (index: number) => Score | null
  /** Whether the per-move Stockfish figures are still being fetched. */
  sfLoading?: boolean
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('.san.current')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const rows: Array<{ number: number; white?: Ply; black?: Ply; whiteIndex: number }> = []
  for (let i = 0; i < plies.length; i++) {
    const ply = plies[i]
    const last = rows[rows.length - 1]
    if (ply.color === 'w' || !last || last.black) {
      rows.push({
        number: ply.moveNumber,
        [ply.color === 'w' ? 'white' : 'black']: ply,
        whiteIndex: i,
      } as (typeof rows)[number])
    } else {
      last.black = ply
    }
  }

  // The opening name of the position reached at the end of each row; repeated
  // names are shown once, at the first row that reaches them.
  const rowOpenings = rows.map((row) => {
    const end = row.whiteIndex + (row.black ? 2 : 1)
    return findOpening(plies.slice(0, end).map((ply) => ply.san))
  })

  return (
    <div className="movelist" ref={listRef}>
      {plies.length === 0 && <div className="movelist-empty">No moves yet</div>}
      {rows.map((row, rowIndex) => {
        const whitePly = row.white ? row.whiteIndex + 1 : -1
        const blackPly = row.black ? row.whiteIndex + (row.white ? 2 : 1) : -1
        const opening = rowOpenings[rowIndex]
        const openingChanged = opening && rowIndex > 0 && rowOpenings[rowIndex - 1]?.name !== opening.name
        const showOpening = opening && (rowIndex === 0 || openingChanged)
        return (
          <div className="movelist-row" key={`${row.number}-${rowIndex}`}>
            <span className="movenum">{row.number}.</span>
            <SanCell
              ply={row.white}
              index={whitePly}
              cursor={cursor}
              onSelect={onSelect}
              maiaPercent={maiaPercent ? maiaPercent(whitePly) : null}
              maiaScore={maiaScore ? maiaScore(whitePly) : null}
              maiaLoading={maiaLoading ?? false}
              sfScore={sfScore ? sfScore(whitePly) : null}
              sfLoading={sfLoading ?? false}
            />
            <SanCell
              ply={row.black}
              index={blackPly}
              cursor={cursor}
              onSelect={onSelect}
              maiaPercent={maiaPercent ? maiaPercent(blackPly) : null}
              maiaScore={maiaScore ? maiaScore(blackPly) : null}
              maiaLoading={maiaLoading ?? false}
              sfScore={sfScore ? sfScore(blackPly) : null}
              sfLoading={sfLoading ?? false}
            />
            {showOpening && (
              <span className="movelist-opening" title={opening.eco}>
                {opening.name}
              </span>
            )}
          </div>
        )
      })}
      {result && result !== '*' && <div className="movelist-result">{result}</div>}
    </div>
  )
}

function SanCell({
  ply,
  index,
  cursor,
  onSelect,
  maiaPercent,
  maiaScore,
  maiaLoading,
  sfScore,
  sfLoading,
}: {
  ply?: Ply
  index: number
  cursor: number
  onSelect: (cursor: number) => void
  maiaPercent: number | null
  maiaScore: Score | null
  maiaLoading: boolean
  sfScore: Score | null
  sfLoading: boolean
}) {
  if (!ply) return <span className="san empty" />

  const badges = [
    maiaPercent !== null && (
      <span
        key="maia"
        className="san-maia"
        title="Maia 2500 policy probability and score for this move"
      >
        {formatPercent(maiaPercent)}
        {maiaScore !== null ? ` ${formatScore(maiaScore)}` : ''}
      </span>
    ),
    maiaPercent === null && (maiaLoading || sfLoading) && <span key="maia-loading" className="san-maia">…</span>,
    sfScore !== null && (
      <span key="sf" className="san-sf" title="Stockfish evaluation of this position (white POV)">
        SF {formatScore(sfScore)}
      </span>
    ),
    sfScore === null && sfLoading && <span key="sf-loading" className="san-sf">…</span>,
  ].filter(Boolean)

  return (
    <span
      className={`san${cursor === index ? ' current' : ''}`}
      onClick={() => onSelect(index)}
    >
      <span className="san-move">{ply.san}</span>
      {badges.length > 0 && <span className="san-badges">{badges}</span>}
    </span>
  )
}

// ----------------------------------------------------------------- eval bar

export function EvalBar({ score, orientation }: { score: Score | null; orientation: 'w' | 'b' }) {
  const share = score ? scoreToWhiteShare(score) : 0.5
  // The bar is drawn white-at-the-bottom; flipping the board flips the bar.
  const whitePercent = (orientation === 'w' ? share : 1 - share) * 100
  const text = score ? formatScore(score) : ''
  const whiteAhead = share >= 0.5

  return (
    <div className="evalbar" title={text}>
      <div className="evalbar-white" style={{ height: `${whitePercent}%` }} />
      <span className={`evalbar-text ${whiteAhead ? 'bottom' : 'top'}`}>{text}</span>
    </div>
  )
}

// -------------------------------------------------------------- engine info

// ------------------------------------------------------------ captured bar

const GLYPH: Record<PieceRole, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }

export function CapturedRow({
  pieces,
  color,
  advantage,
}: {
  pieces: PieceRole[]
  /** Colour of the captured pieces, i.e. the opponent's colour. */
  color: 'w' | 'b'
  advantage: number
}) {
  return (
    <div className="captured">
      {pieces.map((role, i) => (
        <img key={i} src={`/piece/${color}${GLYPH[role]}.svg`} alt="" className="captured-piece" />
      ))}
      {advantage > 0 && <span className="captured-adv">+{advantage}</span>}
    </div>
  )
}
