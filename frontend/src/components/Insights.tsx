/**
 * Insights: what 143 exported Lichess games say about the player.
 *
 * The page is one screen of charts over a static export — there is no account
 * to log into and nothing is fetched. Filters at the top narrow the same list
 * every chart reads, so a speed or a colour applies everywhere at once.
 *
 * What it deliberately does not claim: a plain PGN export has no clock times
 * and no engine evaluations, so nothing here talks about time trouble or
 * blunders. Every number on the page is countable from the moves and the tags.
 */

import { useMemo, useState, type ReactNode } from 'react'

import type { Theme } from '../prefs'
import { ThemePicker } from './ThemePicker'
import { CollapsibleSection } from './CollapsibleSection'
import { Columns, Heatmap, Legend, RatingChart, RecordBars, type BarRow } from './InsightCharts'
import { CHART_W } from '../insights/layout'
import { GAMES, PLAYER } from '../data/games'
import {
  activity,
  bucketBy,
  endings,
  moveCount,
  openings,
  ratingGap,
  ratingLines,
  record,
  splitBy,
  streaks,
  WEEKDAYS,
} from '../insights/stats'
import { ENDING_LABELS, SPEED_LABELS, SPEEDS, type GameRecord, type Speed } from '../insights/types'
import './Insights.css'

/**
 * A speed keeps its colour whatever else is on screen.
 *
 * The slots are the categorical palette in order, so any run of speeds is a run
 * of adjacent slots — the pairs the palette is validated on.
 */
const SPEED_COLORS: Record<Speed, string> = {
  bullet: 'var(--viz-1)',
  blitz: 'var(--viz-2)',
  rapid: 'var(--viz-3)',
  ultraBullet: 'var(--viz-4)',
  classical: 'var(--viz-5)',
  correspondence: 'var(--viz-6)',
}

// Both bucket scales are open at the ends: the first bucket takes everything
// below it and the last everything above, so no game falls off the chart.
const LENGTH_EDGES = [0, 20, 30, 40, 50, 60]
const LENGTH_LABELS = ['<20', '20–29', '30–39', '40–49', '50+']

/** The gap is the opponent's rating minus yours: negative is a weaker opponent. */
const GAP_EDGES = [-400, -200, -100, -25, 25, 100, 200]
const GAP_LABELS = ['−200+', '−200…−100', '−100…−25', 'even', '+25…+100', '+100…']

type ColorFilter = 'all' | 'w' | 'b'
type RatedFilter = 'all' | 'rated' | 'casual'

const percent = (value: number) => `${Math.round(value)}%`

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

const dateRange = (games: GameRecord[]) =>
  games.length ? `${games[0].date} → ${games[games.length - 1].date}` : ''

function Tile({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}

function Card({
  title,
  blurb,
  wide = false,
  children,
}: {
  title: string
  blurb: string
  /** Take the full row — for a long x axis or two stacked plots. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <section className={`insight-card${wide ? ' wide' : ''}`}>
      <h2>{title}</h2>
      <p className="card-note">{blurb}</p>
      {children}
    </section>
  )
}

export function Insights({
  theme,
  onBack,
  onThemeChange,
}: {
  theme: Theme
  onBack: () => void
  onThemeChange: (theme: Theme) => void
}) {
  const [speed, setSpeed] = useState<Speed | 'all'>('all')
  const [color, setColor] = useState<ColorFilter>('all')
  const [rated, setRated] = useState<RatedFilter>('all')

  // Only offer a speed the export actually contains.
  const playedSpeeds = useMemo(
    () => SPEEDS.filter((s) => GAMES.some((game) => game.speed === s)),
    [],
  )

  const games = useMemo(
    () =>
      GAMES.filter(
        (game) =>
          (speed === 'all' || game.speed === speed) &&
          (color === 'all' || game.color === color) &&
          (rated === 'all' || game.rated === (rated === 'rated')),
      ),
    [speed, color, rated],
  )

  const overall = record(games)
  const lines = useMemo(() => ratingLines(games), [games])
  const runs = useMemo(() => streaks(games), [games])
  const bestPeak = lines.reduce<(typeof lines)[number] | null>(
    (best, line) => (!best || line.peak.rating > best.peak.rating ? line : best),
    null,
  )

  const bySpeed: BarRow[] = useMemo(
    () =>
      playedSpeeds
        .map((s) => ({ speed: s, list: games.filter((game) => game.speed === s) }))
        .filter(({ list }) => list.length > 0)
        .map(({ speed: s, list }) => {
          const r = record(list)
          return {
            label: SPEED_LABELS[s],
            parts: [r.wins, r.draws, r.losses] as [number, number, number],
            note: `${percent(r.score)} · ${r.games}`,
          }
        }),
    [games, playedSpeeds],
  )

  const byColor: BarRow[] = useMemo(
    () =>
      splitBy(
        games,
        (game) => game.color,
        (key) => (key === 'w' ? 'As White' : 'As Black'),
      )
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(({ label, record: r }) => ({
          label,
          parts: [r.wins, r.draws, r.losses] as [number, number, number],
          note: `${percent(r.score)} · ${r.games}`,
        })),
    [games],
  )

  const byEnding: BarRow[] = useMemo(
    () =>
      endings(games).map((split) => ({
        label: ENDING_LABELS[split.end],
        parts: [split.won, split.drawn, split.lost] as [number, number, number],
        note: `${split.won + split.drawn + split.lost}`,
      })),
    [games],
  )

  const lengths = useMemo(
    () => bucketBy(games, moveCount, LENGTH_EDGES, (_low, _high, i) => LENGTH_LABELS[i]),
    [games],
  )

  const byGap = useMemo(
    () => bucketBy(games, ratingGap, GAP_EDGES, (_low, _high, i) => GAP_LABELS[i]),
    [games],
  )

  const asWhite = useMemo(() => openings(games.filter((g) => g.color === 'w'), 7), [games])
  const asBlack = useMemo(() => openings(games.filter((g) => g.color === 'b'), 7), [games])

  const heat = useMemo(() => activity(games), [games])
  const hourLabels = ['00', '03', '06', '09', '12', '15', '18', '21']

  const openingRows = (splits: ReturnType<typeof openings>): BarRow[] =>
    splits.map(({ label, record: r }) => ({
      label,
      parts: [r.wins, r.draws, r.losses] as [number, number, number],
      note: `${percent(r.score)} · ${r.games}`,
    }))

  return (
    <div className={`insights theme-${theme}`}>
      <header className="insights-top">
        <button className="brand" onClick={onBack} title="Back to the home page">
          <span className="brand-mark">♞</span> Gambit
        </button>
        <div className="insights-title">
          <h1>Insights</h1>
          <span className="insights-sub">
            {PLAYER} · {GAMES.length} games · {dateRange(GAMES)}
          </span>
        </div>
        <ThemePicker theme={theme} onChange={onThemeChange} />
      </header>

      <div className="filters">
        <div className="filter-group" role="group" aria-label="Time control">
          <button className={speed === 'all' ? 'active' : ''} onClick={() => setSpeed('all')}>
            All speeds
          </button>
          {playedSpeeds.map((s) => (
            <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
              {SPEED_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="filter-group" role="group" aria-label="Colour">
          {(['all', 'w', 'b'] as ColorFilter[]).map((c) => (
            <button key={c} className={color === c ? 'active' : ''} onClick={() => setColor(c)}>
              {c === 'all' ? 'Both colours' : c === 'w' ? 'White' : 'Black'}
            </button>
          ))}
        </div>
        <div className="filter-group" role="group" aria-label="Rated">
          {(['all', 'rated', 'casual'] as RatedFilter[]).map((r) => (
            <button key={r} className={rated === r ? 'active' : ''} onClick={() => setRated(r)}>
              {r === 'all' ? 'Rated & casual' : r === 'rated' ? 'Rated' : 'Casual'}
            </button>
          ))}
        </div>
      </div>

      {games.length === 0 ? (
        <p className="chart-empty">No games match these filters.</p>
      ) : (
        <div className="insight-grid">
          <div className="tiles">
            <Tile value={String(overall.games)} label="Games" note={dateRange(games)} />
            <Tile
              value={percent(overall.score)}
              label="Score"
              note={`${overall.wins}W · ${overall.draws}D · ${overall.losses}L`}
            />
            <Tile
              value={bestPeak ? String(bestPeak.peak.rating) : '—'}
              label="Peak rating"
              note={
                bestPeak
                  ? `${SPEED_LABELS[bestPeak.speed]}, ${new Date(bestPeak.peak.t).toISOString().slice(0, 7)}`
                  : 'no rated games'
              }
            />
            <Tile
              value={String(median(games.map(moveCount)))}
              label="Median length"
              note="moves, both sides"
            />
            {runs.map((run) => (
              <Tile
                key={run.kind}
                value={String(run.length)}
                label={run.kind === 'win' ? 'Longest win run' : 'Longest losing run'}
                note={run.from === run.to ? run.from : `${run.from} → ${run.to}`}
              />
            ))}
          </div>

          <Card
            title="Rating over time"
            wide
            blurb="Rating after every rated game. Each speed is its own ladder — they move independently."
          >
            <RatingChart lines={lines} colors={SPEED_COLORS} width={CHART_W.wide} />
            <Legend
              items={lines.map((line) => ({
                label: SPEED_LABELS[line.speed],
                color: SPEED_COLORS[line.speed],
                note: `peak ${line.peak.rating} · now ${line.latest.rating}`,
              }))}
            />
          </Card>

          <Card
            title="Record by speed"
            blurb="Bars are game counts on a shared scale; the figure at the right is the score, wins plus half the draws."
          >
            <RecordBars rows={bySpeed} label="Wins and losses by time control" />
            <Legend
              items={[
                { label: 'Won', color: 'var(--viz-win)' },
                { label: 'Drawn', color: 'var(--viz-draw)' },
                { label: 'Lost', color: 'var(--viz-loss)' },
              ]}
            />
          </Card>

          <Card title="Record by colour" blurb="The first-move advantage, or the absence of it.">
            <RecordBars rows={byColor} label="Wins and losses by colour" />
          </Card>

          <Card
            title="How the games end"
            blurb="Split by which side of the result it fell on — flagging is only a problem if it happens to you."
          >
            <RecordBars rows={byEnding} label="Endings, split by result" />
          </Card>

          <Card title="Game length" blurb="How many moves the games last, and how the score moves with them.">
            <Columns
              columns={lengths.map((bucket) => ({
                label: bucket.label,
                value: bucket.games.length,
                detail: `${bucket.label} moves · ${percent(bucket.record.score)} score`,
              }))}
              label="Games by length in moves"
            />
            <Columns
              columns={lengths.map((bucket) => ({
                label: bucket.label,
                value: Math.round(bucket.record.score),
                detail: `${bucket.games.length} games of ${bucket.label} moves`,
                negative: bucket.record.score < 50,
              }))}
              reference={{ value: 50, label: 'even' }}
              format={percent}
              label="Score by game length"
            />
          </Card>

          <Card
            title="Opponent strength"
            blurb="Score against opponents by how far their rating sat above or below yours."
          >
            <Columns
              columns={byGap.map((bucket) => ({
                label: bucket.label,
                value: Math.round(bucket.record.score),
                detail: `${bucket.games.length} games, ${bucket.record.wins}W ${bucket.record.draws}D ${bucket.record.losses}L`,
                negative: bucket.record.score < 50,
              }))}
              reference={{ value: 50, label: 'even' }}
              format={percent}
              label="Score by opponent rating difference"
            />
          </Card>

          <Card
            title="Openings"
            wide
            blurb="Named by the app's own book and cut back to the family, so the Najdorf and the Dragon both count as Sicilians."
          >
            <h3>As White</h3>
            <RecordBars rows={openingRows(asWhite)} label="Record by opening, as White" width={CHART_W.wide} />
            <h3>As Black</h3>
            <RecordBars rows={openingRows(asBlack)} label="Record by opening, as Black" width={CHART_W.wide} />
          </Card>

          <Card title="When you play" blurb="Games per weekday and three-hour block, in UTC.">
            <Heatmap
              cells={heat.map((cell) => ({
                row: cell.day,
                column: cell.hour / 3,
                value: cell.games.length,
                detail: `${WEEKDAYS[cell.day]} ${String(cell.hour).padStart(2, '0')}:00–${String(cell.hour + 3).padStart(2, '0')}:00 UTC`,
              }))}
              rows={WEEKDAYS}
              columns={hourLabels}
              label="Games by weekday and hour"
            />
          </Card>

          <CollapsibleSection title={`All ${games.length} games`} defaultOpen={false}>
            <div className="table-wrap">
              <table className="games-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Speed</th>
                    <th>Colour</th>
                    <th>Opponent</th>
                    <th className="num">Rating</th>
                    <th>Result</th>
                    <th className="num">Moves</th>
                  </tr>
                </thead>
                <tbody>
                  {[...games].reverse().map((game) => (
                    <tr key={game.id || `${game.date}${game.time}`}>
                      <td>
                        <a href={`https://lichess.org/${game.id}`} target="_blank" rel="noreferrer">
                          {game.date}
                        </a>
                      </td>
                      <td>{SPEED_LABELS[game.speed]}</td>
                      <td>{game.color === 'w' ? 'White' : 'Black'}</td>
                      <td>{game.opp}</td>
                      <td className="num">{game.oppElo ?? '—'}</td>
                      <td>
                        {game.score === 1 ? 'Won' : game.score === 0.5 ? 'Drawn' : 'Lost'} ·{' '}
                        {ENDING_LABELS[game.end].toLowerCase()}
                      </td>
                      <td className="num">{moveCount(game)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>

          <p className="insights-foot">
            From {PLAYER}'s Lichess export, {dateRange(GAMES)} (times UTC). Rating lines need at least six
            rated games in a speed. Regenerate with{' '}
            <code>python scripts/parse_lichess_pgn.py &lt;export.pgn&gt;</code>.
          </p>
        </div>
      )}
    </div>
  )
}
