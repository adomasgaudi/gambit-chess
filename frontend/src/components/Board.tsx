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

export interface Arrow {
  from: Square
  to: Square
  /** CSS colour; defaults to the engine-hint green. */
  color?: string
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
  /** When given, every occupied square gets a defender-count badge. */
  defence?: Defence[] | null
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
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [dragging, setDragging] = useState<{ square: Square; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<Square | null>(null)
  const pieces = usePieceIdentities(chess)

  // A move from outside (engine, navigation) invalidates any selection.
  const fen = chess.fen()
  useEffect(() => {
    setSelected(null)
    setDragging(null)
  }, [fen])

  // Publish the selection so the page can act on it — the engine restricts its
  // search to the selected piece's moves.
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

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    const square = squareAt(event.clientX, event.clientY, rect, orientation)
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
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    setDragging({ ...dragging, x: event.clientX, y: event.clientY })
    setHover(squareAt(event.clientX, event.clientY, rect, orientation))
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!dragging) return
    const rect = boardRef.current?.getBoundingClientRect()
    const target = rect ? squareAt(event.clientX, event.clientY, rect, orientation) : null
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
      className="board"
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
          : { transform: `translate(${pos.tx}%, ${pos.ty}%)` }
        return (
          <div
            key={piece.id}
            className={`piece ${piece.color}${piece.role}${isDragged ? ' dragging' : ''}`}
            style={style}
          >
            <img src={`/piece/${piece.color}${piece.role.toUpperCase()}.svg`} alt="" draggable={false} />
          </div>
        )
      })}

      {defence?.map((entry) => {
        const pos = squarePos(entry.square, orientation)
        // Outnumbered is the state worth seeing at a glance; "contested" means
        // it holds for now but a trade is available.
        const state =
          entry.attackers > entry.defenders ? 'weak' : entry.attackers > 0 ? 'contested' : 'safe'
        return (
          <div
            key={`def-${entry.square}`}
            className={`defbadge ${state}`}
            style={{ transform: `translate(${pos.tx}%, ${pos.ty}%)` }}
            title={`${entry.square}: defended ${entry.defenders}×, attacked ${entry.attackers}×`}
          >
            <span>{entry.defenders}</span>
          </div>
        )
      })}

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
