/** Engine controls: live eval, search settings, review, and the PV list. */

import { useState, type ReactNode } from 'react'
import './AnalysisPanel.css'

export interface EngineSettings {
  /** How many variations to report. */
  multiPv: number
  /** Ply depth to stop at; 0 means search until interrupted. */
  depth: number
  /** Search threads; ignored when the build is single-threaded. */
  threads: number
  /** Rank only the selected piece's moves instead of the whole position. */
  focusPiece: boolean
}

export const DEPTH_CHOICES = [12, 16, 20, 24, 30, 0]

export interface EngineStats {
  depth: number
  nodes?: number
  nps?: number
  /** Lichess had this position already; the local engine never ran. */
  cloud?: boolean
}

export function AnalysisPanel({
  evalOn,
  onToggleEval,
  reviewProgress,
  onReview,
  canReview,
  settings,
  onSettings,
  maxThreads,
  stats,
  engineName,
  focusLabel,
  children,
}: {
  evalOn: boolean
  onToggleEval: () => void
  /** 0–100 while a full-game review runs, null when idle. */
  reviewProgress: number | null
  onReview: () => void
  canReview: boolean
  settings: EngineSettings
  onSettings: (changes: Partial<EngineSettings>) => void
  /** 0 when the page isn't cross-origin isolated, so threads can't be changed. */
  maxThreads: number
  stats: EngineStats | null
  engineName: string
  /** Set when the lines below rank one piece's moves rather than the position. */
  focusLabel?: string | null
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const reviewing = reviewProgress !== null

  return (
    <div className="analysis-panel">
      <div className="analysis-head">
        <label className="switch">
          <input type="checkbox" checked={evalOn} onChange={onToggleEval} disabled={reviewing} />
          <span>Engine eval</span>
        </label>
        <div className="analysis-head-right">
          <button className="link" onClick={onReview} disabled={!canReview || reviewing}>
            {reviewing ? `Reviewing ${reviewProgress}%` : 'Review game'}
          </button>
          <button
            className={`icon-btn${open ? ' active' : ''}`}
            onClick={() => setOpen((v) => !v)}
            title="Engine settings"
            aria-label="Engine settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {reviewing && (
        <div className="progress">
          <div className="progress-fill" style={{ width: `${reviewProgress}%` }} />
        </div>
      )}

      {open && (
        <div className="engine-settings">
          <Row label="Lines" value={`${settings.multiPv}`}>
            <input
              type="range"
              min={1}
              max={5}
              value={settings.multiPv}
              onChange={(event) => onSettings({ multiPv: Number(event.target.value) })}
            />
          </Row>

          <Row label="Depth" value={settings.depth === 0 ? 'unlimited' : `${settings.depth} ply`}>
            <div className="chiprow">
              {DEPTH_CHOICES.map((depth) => (
                <button
                  key={depth}
                  className={settings.depth === depth ? 'active' : ''}
                  onClick={() => onSettings({ depth })}
                >
                  {depth === 0 ? '∞' : depth}
                </button>
              ))}
            </div>
          </Row>

          {maxThreads > 1 ? (
            <Row label="Threads" value={`${settings.threads} of ${maxThreads}`}>
              <input
                type="range"
                min={1}
                max={maxThreads}
                value={settings.threads}
                onChange={(event) => onSettings({ threads: Number(event.target.value) })}
              />
            </Row>
          ) : (
            <p className="settings-note">
              Single-threaded build — the page isn't cross-origin isolated, so Stockfish can't use
              more than one core.
            </p>
          )}

          <label className="switch">
            <input
              type="checkbox"
              checked={settings.focusPiece}
              onChange={() => onSettings({ focusPiece: !settings.focusPiece })}
            />
            <span>Rank the selected piece's moves</span>
          </label>
          <p className="settings-note">
            Click a piece and the lines become that piece's options, best first, instead of the
            position's. Deselect to go back to the whole position.
          </p>

          <p className="settings-note">
            {engineName}. More lines costs depth: the engine splits the same search across them.
          </p>
        </div>
      )}

      {evalOn && !reviewing && (
        <>
          {focusLabel && <div className="focus-label">Ranking moves for {focusLabel}</div>}
          {stats && (
            <div className="engine-stats">
              <span>depth {stats.depth}</span>
              {stats.nodes !== undefined && <span>{compact(stats.nodes)} nodes</span>}
              {stats.nps !== undefined && <span>{compact(stats.nps)}/s</span>}
              {stats.cloud && <span className="cloud-chip">cloud</span>}
            </div>
          )}
          {children}
        </>
      )}
    </div>
  )
}

function Row({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <span>{label}</span>
        <span className="settings-value">{value}</span>
      </div>
      {children}
    </div>
  )
}

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`
  return `${n}`
}
