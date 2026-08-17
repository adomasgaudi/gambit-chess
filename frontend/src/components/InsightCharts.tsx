/**
 * The four chart shapes the Insights page needs, as plain SVG.
 *
 * No chart library: the page draws a handful of forms over 143 rows, and a
 * library would cost more than it saves. Each chart is sized in its own viewBox
 * and scaled to the card by CSS, so the layout never has to measure anything.
 *
 * Colour is a role, never a raw hex — the roles live in Insights.css and are
 * restated for the dark theme there. Series colour identifies, and text stays
 * in ink: a label next to a line carries a coloured dot rather than being
 * coloured itself.
 */

import { useState, type PointerEvent, type ReactNode } from 'react'

import { CHART_W } from '../insights/layout'
import type { RatingLine } from '../insights/stats'
import { SPEED_LABELS } from '../insights/types'

/** Where the tooltip sits, in viewBox units, plus what it says. */
interface Tip {
  x: number
  y: number
  content: ReactNode
}

/**
 * A chart plus its hover tooltip.
 *
 * The tooltip is HTML, not SVG text, so it can wrap and use the app's type. It
 * is positioned in percentages of the viewBox, which keeps it correct at any
 * rendered width without a resize observer.
 */
function ChartFrame({
  width,
  height,
  tip,
  children,
  onPointerMove,
  onPointerLeave,
  label,
}: {
  width: number
  height: number
  tip: Tip | null
  children: ReactNode
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void
  onPointerLeave?: () => void
  label: string
}) {
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {children}
      </svg>
      {tip && (
        <div
          className={`chart-tip ${tip.x > width * 0.6 ? 'left' : ''}`}
          style={{ left: `${(100 * tip.x) / width}%`, top: `${(100 * tip.y) / height}%` }}
        >
          {tip.content}
        </div>
      )}
    </div>
  )
}

/** Pointer position in viewBox units. */
function atPointer(event: PointerEvent<SVGSVGElement>, width: number, height: number) {
  const rect = event.currentTarget.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
  }
}

export function Legend({ items }: { items: { label: string; color: string; note?: string }[] }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className="swatch" style={{ background: item.color }} />
          {item.label}
          {item.note && <span className="legend-note">{item.note}</span>}
        </li>
      ))}
    </ul>
  )
}

// --- Rating over time -----------------------------------------------------

const RATING_H = 300
const PAD = { top: 18, right: 96, bottom: 28, left: 46 }

/** Round a rating range out to whole hundreds so the gridlines are readable. */
function ratingScale(lines: RatingLine[]) {
  const ratings = lines.flatMap((line) => line.points.map((p) => p.rating))
  const low = Math.floor(Math.min(...ratings) / 100) * 100
  const high = Math.ceil(Math.max(...ratings) / 100) * 100
  const step = high - low > 600 ? 200 : 100
  const ticks: number[] = []
  for (let r = low; r <= high; r += step) ticks.push(r)
  return { low, high, ticks }
}

export function RatingChart({
  lines,
  colors,
  width = CHART_W.wide,
}: {
  lines: RatingLine[]
  colors: Record<string, string>
  width?: number
}) {
  const [tip, setTip] = useState<Tip | null>(null)

  if (lines.length === 0) {
    return <p className="chart-empty">Not enough rated games in this selection to draw a rating line.</p>
  }

  const times = lines.flatMap((line) => line.points.map((p) => p.t))
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const { low, high, ticks } = ratingScale(lines)

  const x = (t: number) =>
    PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * (width - PAD.left - PAD.right)
  const y = (rating: number) =>
    RATING_H - PAD.bottom - ((rating - low) / Math.max(high - low, 1)) * (RATING_H - PAD.top - PAD.bottom)

  // One tick per year the player was active, which is as dense as this gets.
  const years: number[] = []
  for (let year = new Date(t0).getUTCFullYear(); year <= new Date(t1).getUTCFullYear(); year++) {
    years.push(year)
  }

  const hover = (event: PointerEvent<SVGSVGElement>) => {
    const at = atPointer(event, width, RATING_H)
    let best: { line: RatingLine; t: number; rating: number; d: number } | null = null
    for (const line of lines) {
      for (const point of line.points) {
        // Distance in viewBox units, so a near-vertical jump doesn't win over
        // the point the pointer is actually next to.
        const d = Math.hypot(x(point.t) - at.x, y(point.rating) - at.y)
        if (!best || d < best.d) best = { line, t: point.t, rating: point.rating, d }
      }
    }
    if (!best || best.d > 40) return setTip(null)
    setTip({
      x: x(best.t),
      y: y(best.rating),
      content: (
        <>
          <strong>{best.rating}</strong>
          <span className="tip-row">
            <span className="swatch" style={{ background: colors[best.line.speed] }} />
            {SPEED_LABELS[best.line.speed]}
          </span>
          <span className="tip-dim">{new Date(best.t).toISOString().slice(0, 10)}</span>
        </>
      ),
    })
  }

  return (
    <ChartFrame
      width={width}
      height={RATING_H}
      tip={tip}
      onPointerMove={hover}
      onPointerLeave={() => setTip(null)}
      label="Rating after each rated game, by time control"
    >
      {ticks.map((rating) => (
        <g key={rating}>
          <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(rating)} y2={y(rating)} />
          <text className="axis" x={PAD.left - 8} y={y(rating) + 4} textAnchor="end">
            {rating}
          </text>
        </g>
      ))}
      {years.map((year) => {
        const t = Date.UTC(year, 0, 1)
        if (t < t0 || t > t1) return null
        return (
          <text key={year} className="axis" x={x(t)} y={RATING_H - 8} textAnchor="middle">
            {year}
          </text>
        )
      })}
      <line
        className="baseline"
        x1={PAD.left}
        x2={width - PAD.right}
        y1={RATING_H - PAD.bottom}
        y2={RATING_H - PAD.bottom}
      />

      {lines.map((line) => (
        <polyline
          key={line.speed}
          className="series-line"
          stroke={colors[line.speed]}
          points={line.points.map((p) => `${x(p.t)},${y(p.rating)}`).join(' ')}
        />
      ))}

      {/* Direct labels at the line ends: identity without a legend lookup. */}
      {lines.map((line) => (
        <g key={line.speed}>
          <circle
            className="series-dot"
            cx={x(line.latest.t)}
            cy={y(line.latest.rating)}
            r={4}
            fill={colors[line.speed]}
          />
          <text className="series-label" x={x(line.latest.t) + 10} y={y(line.latest.rating) + 4}>
            {SPEED_LABELS[line.speed]} {line.latest.rating}
          </text>
        </g>
      ))}

      {tip && <line className="crosshair" x1={tip.x} x2={tip.x} y1={PAD.top} y2={RATING_H - PAD.bottom} />}
    </ChartFrame>
  )
}

// --- Win / draw / loss rows ----------------------------------------------

export interface BarRow {
  label: string
  /** Left to right: wins, draws, losses. */
  parts: [number, number, number]
  /** Small print at the right of the row. */
  note?: string
}

const ROW_H = 30
const NOTE_W = 84

/**
 * Horizontal stacked bars, one row per category.
 *
 * Every row is scaled to the same maximum rather than to 100%, so a row of 8
 * games doesn't look like a row of 56. The share is in the tooltip and the
 * note instead.
 *
 * The label gutter is sized from the longest label — opening names run to
 * "Queen's Gambit Declined" and a fixed gutter would either clip them or waste
 * a third of the chart on the rows that don't need it.
 */
export function RecordBars({
  rows,
  label,
  width = CHART_W.half,
}: {
  rows: BarRow[]
  label: string
  width?: number
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const height = rows.length * ROW_H + 14
  const max = Math.max(1, ...rows.map((row) => row.parts[0] + row.parts[1] + row.parts[2]))
  const longest = rows.reduce((n, row) => Math.max(n, row.label.length), 0)
  const labelW = Math.min(Math.max(6.3 * longest + 12, 70), width * 0.32)
  const full = width - labelW - NOTE_W
  const names = ['Won', 'Drawn', 'Lost']
  const fills = ['var(--viz-win)', 'var(--viz-draw)', 'var(--viz-loss)']

  return (
    <ChartFrame width={width} height={height} tip={tip} onPointerLeave={() => setTip(null)} label={label}>
      {rows.map((row, i) => {
        const total = row.parts[0] + row.parts[1] + row.parts[2]
        const top = i * ROW_H + 7
        // Lay the row out first, so each segment knows whether another follows
        // it — the gap that separates two fills belongs to the earlier one.
        let cursor = labelW
        const segments = row.parts.map((value, part) => {
          const x = cursor
          const width = (value / max) * full
          cursor += width
          return { part, value, x, width }
        })
        const lastDrawn = segments.filter((s) => s.value > 0).pop()
        return (
          <g key={row.label}>
            <text className="row-label" x={labelW - 10} y={top + 13} textAnchor="end">
              {row.label}
            </text>
            {segments.map(({ part, value, x, width }) => {
              if (value === 0) return null
              return (
                <rect
                  key={part}
                  x={x}
                  width={Math.max(width - (part === lastDrawn?.part ? 0 : 2), 1)}
                  y={top}
                  height={18}
                  rx={3}
                  fill={fills[part]}
                  onPointerEnter={() =>
                    setTip({
                      x: x + width / 2,
                      y: top,
                      content: (
                        <>
                          <strong>
                            {value} {names[part].toLowerCase()}
                          </strong>
                          <span className="tip-dim">
                            {row.label} · {Math.round((100 * value) / total)}% of {total}
                          </span>
                        </>
                      ),
                    })
                  }
                />
              )
            })}
            {row.note && (
              <text className="row-note" x={width - 4} y={top + 13} textAnchor="end">
                {row.note}
              </text>
            )}
          </g>
        )
      })}
    </ChartFrame>
  )
}

// --- Columns --------------------------------------------------------------

export interface Column {
  label: string
  value: number
  /** Tooltip body; the value alone is rarely the whole story. */
  detail: string
  /** Draw the column in the loss colour — used for "below even" bars. */
  negative?: boolean
}

const COL_H = 220

/**
 * Vertical bars for a distribution or a rate.
 *
 * `reference` draws one dashed line — the even-score mark on a win-rate chart.
 * Bars are labelled directly with their value, so the y axis carries only the
 * top of the scale.
 */
export function Columns({
  columns,
  reference,
  format = (v: number) => String(v),
  label,
  width = CHART_W.half,
}: {
  columns: Column[]
  reference?: { value: number; label: string }
  format?: (value: number) => string
  label: string
  width?: number
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const max = Math.max(1, ...columns.map((c) => c.value), reference?.value ?? 0)
  const left = 16
  const right = reference ? 74 : 16
  const bottom = 34
  const top = 22
  const band = (width - left - right) / Math.max(columns.length, 1)
  const y = (value: number) => COL_H - bottom - (value / max) * (COL_H - top - bottom)

  return (
    <ChartFrame width={width} height={COL_H} tip={tip} onPointerLeave={() => setTip(null)} label={label}>
      <line className="baseline" x1={left} x2={width - right} y1={COL_H - bottom} y2={COL_H - bottom} />
      {reference && (
        <g>
          <line
            className="reference"
            x1={left}
            x2={width - right}
            y1={y(reference.value)}
            y2={y(reference.value)}
          />
          <text className="axis" x={width - right + 8} y={y(reference.value) + 4}>
            {reference.label}
          </text>
        </g>
      )}
      {columns.map((column, i) => {
        const width = Math.max(band - 10, 6)
        const x = left + i * band + (band - width) / 2
        const height = COL_H - bottom - y(column.value)
        return (
          <g key={column.label}>
            <rect
              x={x}
              y={y(column.value)}
              width={width}
              height={Math.max(height, column.value > 0 ? 2 : 0)}
              rx={4}
              fill={column.negative ? 'var(--viz-loss)' : 'var(--viz-1)'}
            />
            {/* An invisible full-height target: a 2px bar is not hoverable. */}
            <rect
              x={x}
              y={top}
              width={width}
              height={COL_H - bottom - top}
              fill="transparent"
              onPointerEnter={() =>
                setTip({
                  x: x + width / 2,
                  y: Math.min(y(column.value), COL_H - bottom - 20),
                  content: (
                    <>
                      <strong>{format(column.value)}</strong>
                      <span className="tip-dim">{column.detail}</span>
                    </>
                  ),
                })
              }
            />
            <text className="col-value" x={x + width / 2} y={y(column.value) - 7} textAnchor="middle">
              {format(column.value)}
            </text>
            <text className="axis" x={x + width / 2} y={COL_H - bottom + 17} textAnchor="middle">
              {column.label}
            </text>
          </g>
        )
      })}
    </ChartFrame>
  )
}

// --- Heatmap --------------------------------------------------------------

export interface HeatCell {
  row: number
  column: number
  value: number
  detail: string
}

const SEQ_STEPS = 6

/**
 * A grid coloured by one sequential ramp.
 *
 * Empty cells are left as an outline rather than the palest step: "no games"
 * and "one game" are different facts and shouldn't shade into each other.
 */
export function Heatmap({
  cells,
  rows,
  columns,
  label,
  width = CHART_W.half,
}: {
  cells: HeatCell[]
  rows: string[]
  columns: string[]
  label: string
  width?: number
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const max = Math.max(1, ...cells.map((cell) => cell.value))
  const left = 44
  const top = 20
  const cell = Math.min((width - left - 8) / columns.length, 48)
  const height = top + rows.length * cell + 10

  return (
    <ChartFrame width={width} height={height} tip={tip} onPointerLeave={() => setTip(null)} label={label}>
      {columns.map((name, i) => (
        <text key={name} className="axis" x={left + i * cell + cell / 2} y={12} textAnchor="middle">
          {name}
        </text>
      ))}
      {rows.map((name, i) => (
        <text key={name} className="axis" x={left - 8} y={top + i * cell + cell / 2 + 4} textAnchor="end">
          {name}
        </text>
      ))}
      {cells.map((c) => {
        const step = c.value === 0 ? 0 : Math.max(1, Math.ceil((c.value / max) * SEQ_STEPS))
        return (
          <rect
            key={`${c.row}-${c.column}`}
            x={left + c.column * cell + 1}
            y={top + c.row * cell + 1}
            width={cell - 2}
            height={cell - 2}
            rx={3}
            className={c.value === 0 ? 'heat-empty' : ''}
            fill={c.value === 0 ? 'transparent' : `var(--viz-seq-${step})`}
            onPointerEnter={() =>
              setTip({
                x: left + c.column * cell + cell / 2,
                y: top + c.row * cell,
                content: (
                  <>
                    <strong>
                      {c.value} {c.value === 1 ? 'game' : 'games'}
                    </strong>
                    <span className="tip-dim">{c.detail}</span>
                  </>
                ),
              })
            }
          />
        )
      })}
    </ChartFrame>
  )
}
