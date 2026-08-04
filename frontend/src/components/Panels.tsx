/** The pieces of chrome around the board: clocks, move list, eval bar, lines. */

import { useEffect, useRef } from 'react'
import type { Square } from 'chess.js'
import type { PieceRole, Ply } from '../chess/game'
import type { EngineLine, Score } from '../engines/types'
import { formatScore, scoreToWhiteShare } from '../engines/types'
import type { MoveQuality } from '../chess/quality'
import { QUALITY_META } from '../chess/quality'
import { NATURE_META, describeInsight, type Insight } from '../chess/nature'
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
  quality,
  insights,
  onSelect,
  result,
}: {
  plies: Ply[]
  cursor: number
  quality: Map<number, MoveQuality>
  /** What kind of mistake each losing move was; empty until a review runs. */
  insights?: Map<number, Insight>
  onSelect: (cursor: number) => void
  result?: string
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

  return (
    <div className="movelist" ref={listRef}>
      {plies.length === 0 && <div className="movelist-empty">No moves yet</div>}
      {rows.map((row, rowIndex) => {
        const whitePly = row.white ? row.whiteIndex + 1 : -1
        const blackPly = row.black ? row.whiteIndex + (row.white ? 2 : 1) : -1
        return (
          <div className="movelist-row" key={`${row.number}-${rowIndex}`}>
            <span className="movenum">{row.number}.</span>
            <SanCell ply={row.white} index={whitePly} cursor={cursor} quality={quality} insights={insights} onSelect={onSelect} />
            <SanCell ply={row.black} index={blackPly} cursor={cursor} quality={quality} insights={insights} onSelect={onSelect} />
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
  quality,
  insights,
  onSelect,
}: {
  ply?: Ply
  index: number
  cursor: number
  quality: Map<number, MoveQuality>
  insights?: Map<number, Insight>
  onSelect: (cursor: number) => void
}) {
  if (!ply) return <span className="san empty" />
  const mark = quality.get(index - 1)
  const meta = mark ? QUALITY_META[mark] : null
  const insight = insights?.get(index - 1)
  const nature = insight ? NATURE_META[insight.nature] : null

  return (
    <span
      className={`san${cursor === index ? ' current' : ''}`}
      onClick={() => onSelect(index)}
      title={insight && meta ? `${meta.label} — ${describeInsight(insight)}` : meta?.label}
    >
      {ply.san}
      {meta && (
        <span className="san-mark" style={{ color: meta.color }}>
          {meta.glyph}
        </span>
      )}
      {nature && (
        <span className="san-nature" style={{ color: nature.color }}>
          {nature.glyph}
        </span>
      )}
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

export function EngineLines({
  lines,
  turn,
  onHover,
  sanForLine,
  openingForLine,
}: {
  lines: EngineLine[]
  turn: 'w' | 'b'
  onHover: (line: EngineLine | null) => void
  sanForLine: (pv: string[]) => string[]
  /** Name of the opening this line transposes into, if the book knows one. */
  openingForLine?: (pv: string[]) => { eco: string; name: string } | null
}) {
  if (lines.length === 0) return <div className="lines-empty">Engine idle</div>
  return (
    <div className="engine-lines" onMouseLeave={() => onHover(null)}>
      {lines.map((line) => {
        const whitePov = {
          cp: line.cp === undefined ? undefined : line.cp * (turn === 'w' ? 1 : -1),
          mate: line.mate === undefined ? undefined : line.mate * (turn === 'w' ? 1 : -1),
        }
        const positive = scoreToWhiteShare(whitePov) >= 0.5
        const opening = openingForLine?.(line.pv)
        return (
          <div className="engine-line" key={line.multipv} onMouseEnter={() => onHover(line)}>
            <span className={`line-score ${positive ? 'pos' : 'neg'}`}>{formatScore(whitePov)}</span>
            <span className="line-body">
              <span className="line-pv">{sanForLine(line.pv).slice(0, 12).join(' ')}</span>
              {opening && (
                <span className="line-opening" title={`${opening.eco} · ${opening.name}`}>
                  {opening.name}
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

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
