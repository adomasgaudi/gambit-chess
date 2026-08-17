/**
 * The board: pieces, drag-and-drop, click-to-move, highlights and arrows.
 *
 * Everything is positioned in percentages inside one square container, so the
 * whole thing scales with its parent and the piece animation is a single CSS
 * transform transition rather than per-square DOM churn.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chess, Square } from 'chess.js'
import type { Defence, PieceRole } from '../chess/game'
import './Board.css'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const
const PIECE_CIRCLE_RADIUS = 0.43
const KING_PROTECTION_RADIUS = PIECE_CIRCLE_RADIUS + 0.45
const ROUTE_CLEARANCE = 0.62

export interface Arrow {
  from: Square
  to: Square
  /** CSS colour; defaults to the engine-hint green. */
  color?: string
}

/**
 * 'classic' is the flat artwork and 'coin' is a side-coloured disk. Every
 * '3d' family style is drawn by Board3D instead — a real scene, not a style
 * of this board — each with its own piece material recipe.
 */
export type PieceStyle = 'classic' | 'coin' | '3d' | '3d-marble'

type DefenceKind = 'defence' | 'attack'

interface DefenceArrow extends Arrow {
  kind: DefenceKind
  side: 'w' | 'b'
}

interface RoutedDefencePath {
  path: string
  end: Point
  color: string
  kind: DefenceKind
  side: 'w' | 'b'
}

export interface BoardProps {
  chess: Chess
  orientation: 'w' | 'b'
  /** Which colours the human may move. Empty = board is read-only. */
  movable: Array<'w' | 'b'>
  lastMove?: { from: Square; to: Square } | null
  checkSquare?: Square | null
  dests: Map<Square, Square[]>
  arrows?: Arrow[]
  onMove: (from: Square, to: Square) => void
  /** Squares to tint, e.g. an engine suggestion. */
  highlights?: Square[]
  /** Fires whenever the selected square changes, including on deselect. */
  onSelectChange?: (square: Square | null) => void
  /** When given, every defender is connected to its defended piece with an arrow. */
  defence?: Defence[] | null
  /** Flat art or side-coloured disks. */
  pieceStyle?: PieceStyle
}

interface PieceOnBoard {
  id: string
  square: Square
  role: PieceRole
  color: 'w' | 'b'
}

/**
 * Board coordinates → the file/rank index a square sits at, and the translate
 * percentages that move a one-square-sized element there.
 *
 * The percentages are multiples of 100, not 12.5: a percentage in `translate()`
 * resolves against the element being moved, and these elements are already
 * exactly one square wide.
 */
function squarePos(square: Square, orientation: 'w' | 'b'): { x: number; y: number; tx: number; ty: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number])
  const rank = RANKS.indexOf(square[1] as (typeof RANKS)[number])
  const x = orientation === 'w' ? file : 7 - file
  const y = orientation === 'w' ? 7 - rank : rank
  return { x, y, tx: x * 100, ty: y * 100 }
}

function squareAt(x: number, y: number, rect: DOMRect, orientation: 'w' | 'b'): Square | null {
  const col = Math.floor(((x - rect.left) / rect.width) * 8)
  const row = Math.floor(((y - rect.top) / rect.height) * 8)
  if (col < 0 || col > 7 || row < 0 || row > 7) return null
  const file = orientation === 'w' ? col : 7 - col
  const rank = orientation === 'w' ? 7 - row : row
  return (FILES[file] + RANKS[rank]) as Square
}

interface Point {
  x: number
  y: number
}

interface OccupiedCenter {
  square: Square
  center: Point
}

function squareCenter(square: Square, orientation: 'w' | 'b'): Point {
  const pos = squarePos(square, orientation)
  return { x: pos.x + 0.5, y: pos.y + 0.5 }
}

function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const inverse = 1 - t
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  }
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return distanceBetween(point, start)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return distanceBetween(point, { x: start.x + t * dx, y: start.y + t * dy })
}

function directPathBlocked(start: Point, end: Point, obstacles: OccupiedCenter[]): boolean {
  return obstacles.some(({ center }) => distanceToSegment(center, start, end) < ROUTE_CLEARANCE)
}

function routeScore(start: Point, control: Point, end: Point, obstacles: OccupiedCenter[]): number {
  let score = 0
  for (let i = 1; i < 40; i++) {
    const point = quadraticPoint(start, control, end, i / 40)
    for (const obstacle of obstacles) {
      const distance = distanceBetween(point, obstacle.center)
      if (distance < ROUTE_CLEARANCE) score += 12 + (ROUTE_CLEARANCE - distance) * 12
      else if (distance < 0.95) score += 0.95 - distance
    }
  }
  return score
}

function defencePath(
  arrow: Arrow,
  orientation: 'w' | 'b',
  obstacles: OccupiedCenter[],
): { path: string; end: Point } {
  const sourceCenter = squareCenter(arrow.from, orientation)
  const targetCenter = squareCenter(arrow.to, orientation)
  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y
  const distance = Math.hypot(dx, dy)
  if (!distance) return { path: '', end: targetCenter }

  const unit = { x: dx / distance, y: dy / distance }
  const perpendicular = { x: -unit.y, y: unit.x }
  const circleRadius = PIECE_CIRCLE_RADIUS
  const start = {
    x: sourceCenter.x + unit.x * circleRadius,
    y: sourceCenter.y + unit.y * circleRadius,
  }
  const end = {
    x: targetCenter.x - unit.x * circleRadius,
    y: targetCenter.y - unit.y * circleRadius,
  }
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const bend = Math.min(1.3, Math.max(0.62, distance * 0.24))
  const clamp = (value: number) => Math.max(0.12, Math.min(7.88, value))
  const candidates = [
    { x: clamp(midpoint.x + perpendicular.x * bend), y: clamp(midpoint.y + perpendicular.y * bend) },
    { x: clamp(midpoint.x - perpendicular.x * bend), y: clamp(midpoint.y - perpendicular.y * bend) },
  ]
  const routeObstacles = obstacles.filter(({ square }) => square !== arrow.from && square !== arrow.to)
  if (!directPathBlocked(start, end, routeObstacles)) {
    return {
      path: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
      end,
    }
  }

  const control = candidates.reduce((best, candidate) =>
    routeScore(start, candidate, end, routeObstacles) < routeScore(start, best, end, routeObstacles) ? candidate : best,
  )

  return {
    path: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    end,
  }
}

/**
 * Stable per-piece identities across positions, so React animates a piece
 * sliding rather than one vanishing and another appearing. Pieces are matched
 * to the previous position by (colour, role) nearest-square; anything left over
 * is new.
 */
function usePieceIdentities(chess: Chess): PieceOnBoard[] {
  const previous = useRef<PieceOnBoard[]>([])
  const nextId = useRef(0)
  const fen = chess.fen()

  return useMemo(() => {
    const current: Array<Omit<PieceOnBoard, 'id'>> = []
    for (const row of chess.board()) {
      for (const piece of row) {
        if (piece) current.push({ square: piece.square, role: piece.type as PieceRole, color: piece.color })
      }
    }

    const unclaimed = [...previous.current]
    const assigned: PieceOnBoard[] = []
    const distance = (a: Square, b: Square) =>
      Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(a.charCodeAt(1) - b.charCodeAt(1))

    // Exact square matches first: a piece that didn't move keeps its identity.
    for (const piece of current) {
      const exact = unclaimed.findIndex(
        (p) => p.square === piece.square && p.role === piece.role && p.color === piece.color,
      )
      if (exact !== -1) {
        assigned.push({ ...unclaimed[exact], square: piece.square })
        unclaimed.splice(exact, 1)
      } else {
        assigned.push({ ...piece, id: '' })
      }
    }

    // Then the movers, matched to the nearest same-kind piece from before.
    for (const piece of assigned) {
      if (piece.id) continue
      let best = -1
      let bestDistance = Infinity
      for (let i = 0; i < unclaimed.length; i++) {
        const candidate = unclaimed[i]
        if (candidate.role !== piece.role || candidate.color !== piece.color) continue
        const d = distance(candidate.square, piece.square)
        if (d < bestDistance) {
          bestDistance = d
          best = i
        }
      }
      if (best !== -1) {
        piece.id = unclaimed[best].id
        unclaimed.splice(best, 1)
      } else {
        piece.id = `p${nextId.current++}`
      }
    }

    previous.current = assigned
    return assigned
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen])
}

export function Board({
  chess,
  orientation,
  movable,
  lastMove,
  checkSquare,
  dests,
  arrows = [],
  highlights = [],
  onMove,
  onSelectChange,
  defence,
  pieceStyle = 'classic',
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [dragging, setDragging] = useState<{ square: Square; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<Square | null>(null)
  const fen = chess.fen()
  const pieces = usePieceIdentities(chess)
  const defenceArrows = useMemo<DefenceArrow[]>(() => {
    if (!defence) return []
    return defence.flatMap((entry) => {
      const target = chess.get(entry.square)
      if (!target) return []
      const enemy = target.color === 'w' ? 'b' : 'w'
      const lineColor = target.color === 'w' ? 'var(--arrow-white)' : 'var(--arrow-black)'
      const arrowsFrom = (color: 'w' | 'b', kind: DefenceKind) =>
        chess.attackers(entry.square, color).flatMap((from) => {
          const source = chess.get(from)
          if (!source || source.type === 'k') return []
          return [{ from, to: entry.square, color: lineColor, kind, side: target.color }]
        })
      return [
        ...(target.type === 'k'
          ? []
          : arrowsFrom(target.color, 'defence')),
        ...arrowsFrom(enemy, 'attack'),
      ]
    })
  }, [chess, defence])
  const kingProtectionCircles = defence
    ? pieces.filter((piece) => piece.role === 'k').map((piece) => ({ id: piece.id, center: squareCenter(piece.square, orientation) }))
    : []
  const defencePaths = useMemo(() => {
    if (defenceArrows.length === 0) return []
    const obstacles = chess.board().flatMap((row) =>
      row.flatMap((piece) => (piece ? [{ square: piece.square, center: squareCenter(piece.square, orientation) }] : [])),
    )
    return defenceArrows.map((arrow): RoutedDefencePath => ({
      ...defencePath(arrow, orientation, obstacles),
      color: arrow.color ?? 'var(--arrow-defence)',
      kind: arrow.kind,
      side: arrow.side,
    }))
  }, [chess, defenceArrows, orientation])

  // A move from outside (engine, navigation) invalidates any selection.
  useEffect(() => {
    setSelected(null)
    setDragging(null)
  }, [fen])

  // Publish the selection so the page can act on it — the engine restricts its
  useEffect(() => {
    onSelectChange?.(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const canMoveFrom = (square: Square): boolean => {
    const piece = chess.get(square)
    return !!piece && movable.includes(piece.color) && (dests.get(square)?.length ?? 0) > 0
  }

  const tryMove = (from: Square, to: Square) => {
    if (dests.get(from)?.includes(to)) onMove(from, to)
  }

  const squareFrom = (x: number, y: number): Square | null => {
    const rect = boardRef.current?.getBoundingClientRect()
    return rect ? squareAt(x, y, rect, orientation) : null
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    const square = squareFrom(event.clientX, event.clientY)
    if (!square) return

    if (selected && square !== selected && dests.get(selected)?.includes(square)) {
      tryMove(selected, square)
      setSelected(null)
      return
    }

    if (canMoveFrom(square)) {
      event.preventDefault()
      boardRef.current?.setPointerCapture(event.pointerId)
      setSelected(square)
      setDragging({ square, x: event.clientX, y: event.clientY })
      setHover(square)
    } else {
      setSelected(null)
    }
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging) return
    setDragging({ ...dragging, x: event.clientX, y: event.clientY })
    setHover(squareFrom(event.clientX, event.clientY))
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!dragging) return
    const target = squareFrom(event.clientX, event.clientY)
    const origin = dragging.square
    setDragging(null)
    setHover(null)
    if (target && target !== origin) {
      tryMove(origin, target)
      setSelected(null)
    } else {
      // A click (press and release on the same square) leaves it selected so
      // the player can click the destination next.
      setSelected(origin)
    }
  }

  const rect = boardRef.current?.getBoundingClientRect()
  const destSquares = selected ? (dests.get(selected) ?? []) : []

  return (
    <div
      className={`board pieces-${pieceStyle}`}
      ref={boardRef}
      data-orientation={orientation}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="board-squares" />

      {lastMove && (
        <>
          <Marker className="sq-lastmove" square={lastMove.from} orientation={orientation} />
          <Marker className="sq-lastmove" square={lastMove.to} orientation={orientation} />
        </>
      )}
      {highlights.map((square) => (
        <Marker key={`hl-${square}`} className="sq-highlight" square={square} orientation={orientation} />
      ))}
      {checkSquare && <Marker className="sq-check" square={checkSquare} orientation={orientation} />}
      {selected && <Marker className="sq-selected" square={selected} orientation={orientation} />}
      {hover && dragging && hover !== dragging.square && (
        <Marker className="sq-hover" square={hover} orientation={orientation} />
      )}

      {destSquares.map((square) => (
        <Marker
          key={`dest-${square}`}
          className={chess.get(square) ? 'dest dest-capture' : 'dest'}
          square={square}
          orientation={orientation}
        />
      ))}

      {pieces.map((piece) => {
        const isDragged = dragging?.square === piece.square
        const pos = squarePos(piece.square, orientation)
        const style: React.CSSProperties = isDragged && rect
          ? {
              transform: `translate(${dragging.x - rect.left - rect.width / 16}px, ${
                dragging.y - rect.top - rect.height / 16
              }px)`,
              transition: 'none',
              zIndex: 20,
            }
          : {
              transform: `translate(${pos.tx}%, ${pos.ty}%)`,
              // A standing piece overlaps the rank behind it, so nearer ranks
              // have to paint later. Flat styles never overlap, but the order
              // is harmless there.
              zIndex: isDragged ? 20 : 10 + pos.y,
            }
        const code = `${piece.color}${piece.role.toUpperCase()}`
        const image = <img src={`/piece/${code}.svg`} alt="" draggable={false} />
        return (
          <div
            key={piece.id}
            className={`piece ${piece.color}${piece.role} side-${piece.color}${isDragged ? ' dragging' : ''}`}
            style={style}
          >
            {pieceStyle === 'coin' ? <div className="piece-coin">{image}</div> : image}
          </div>
        )
      })}

      {(defencePaths.length > 0 || kingProtectionCircles.length > 0) && (
        <svg className="defence-arrows" viewBox="0 0 8 8">
          {kingProtectionCircles.map(({ id, center }) => (
            <circle
              key={`king-protection-${id}`}
              className="king-protection"
              cx={center.x}
              cy={center.y}
              r={KING_PROTECTION_RADIUS}
            />
          ))}
          <defs>
            {defencePaths.map(({ color, kind }, i) => (
              kind === 'attack' ? (
              <marker
                key={i}
                id={`defence-arrowhead-${i}`}
                orient="auto"
                markerWidth="3"
                markerHeight="3.6"
                refX="2.6"
                refY="1.8"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 V3.6 L2.6,1.8 Z" fill={color} />
              </marker>
              ) : null
            ))}
          </defs>
          {defencePaths.map(({ path, color, kind }, i) => (
            <path
              key={i}
              className={`defence-arrow ${defencePaths[i].side === 'w' ? 'white' : 'black'}`}
              d={path}
              stroke={color}
              markerEnd={kind === 'attack' ? `url(#defence-arrowhead-${i})` : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {defencePaths.map(({ end, color, kind, side }, i) =>
            kind === 'defence' ? (
              <circle
                key={`defence-dot-${i}`}
                className={`defence-dot ${side === 'w' ? 'white' : 'black'}`}
                cx={end.x}
                cy={end.y}
                r="0.1"
                fill="none"
                stroke={color}
              />
            ) : null,
          )}
        </svg>
      )}

      {arrows.length > 0 && (
        <svg className="board-arrows" viewBox="0 0 8 8">
          <defs>
            {arrows.map((arrow, i) => (
              <marker
                key={i}
                id={`arrowhead-${i}`}
                orient="auto"
                markerWidth="3"
                markerHeight="3.6"
                refX="1.4"
                refY="1.8"
              >
                <path d="M0,0 V3.6 L2.6,1.8 Z" fill={arrow.color ?? 'var(--arrow)'} />
              </marker>
            ))}
          </defs>
          {arrows.map((arrow, i) => {
            const a = squarePos(arrow.from, orientation)
            const b = squarePos(arrow.to, orientation)
            return (
              <line
                key={i}
                x1={a.x + 0.5}
                y1={a.y + 0.5}
                x2={b.x + 0.5}
                y2={b.y + 0.5}
                stroke={arrow.color ?? 'var(--arrow)'}
                strokeWidth={0.15}
                markerEnd={`url(#arrowhead-${i})`}
                opacity={0.85}
              />
            )
          })}
        </svg>
      )}

      <Coordinates orientation={orientation} />
    </div>
  )
}

function Marker({
  square,
  orientation,
  className,
}: {
  square: Square
  orientation: 'w' | 'b'
  className: string
}) {
  const pos = squarePos(square, orientation)
  return <div className={className} style={{ transform: `translate(${pos.tx}%, ${pos.ty}%)` }} />
}

function Coordinates({ orientation }: { orientation: 'w' | 'b' }) {
  const files = orientation === 'w' ? FILES : [...FILES].reverse()
  const ranks = orientation === 'w' ? [...RANKS].reverse() : RANKS
  return (
    <>
      <div className="coords coords-files">
        {files.map((file, i) => (
          <span key={file} className={i % 2 ? 'dark' : 'light'}>
            {file}
          </span>
        ))}
      </div>
      <div className="coords coords-ranks">
        {ranks.map((rank, i) => (
          <span key={rank} className={i % 2 ? 'light' : 'dark'}>
            {rank}
          </span>
        ))}
      </div>
    </>
  )
}
