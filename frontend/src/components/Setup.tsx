/** The "new game" form: Maia strength, colour, and time control. */

import { useEffect, useRef, useState } from 'react'
import type { Pace } from '../chess/thinkTime'
import { CollapsibleSection } from './CollapsibleSection'
import './Setup.css'

export type Opponent = 'maia'

export interface TimeControl {
  label: string
  initialSeconds: number
  incrementSeconds: number
}

export const TIME_CONTROLS: TimeControl[] = [
  { label: '1+0 Bullet', initialSeconds: 60, incrementSeconds: 0 },
  { label: '3+2 Blitz', initialSeconds: 180, incrementSeconds: 2 },
  { label: '5+0 Blitz', initialSeconds: 300, incrementSeconds: 0 },
  { label: '10+0 Rapid', initialSeconds: 600, incrementSeconds: 0 },
  { label: '15+10 Classical', initialSeconds: 900, incrementSeconds: 10 },
  { label: 'Unlimited', initialSeconds: 0, incrementSeconds: 0 },
]

function compactTimeLabel(timeControl: TimeControl): string {
  return timeControl.label === 'Unlimited' ? '∞' : timeControl.label.split(' ')[0]
}

export interface Setup {
  opponent: Opponent
  playerColor: 'w' | 'b'
  maiaRating: number
  /** How long Maia pretends to think — it decides instantly on its own. */
  maiaPace: Pace
  timeControl: TimeControl
  /** Offer the opponent's top replies to explore instead of playing one silently. */
  explore: boolean
  /** How many of those replies are offered. */
  exploreVariants: number
}

export const EXPLORE_VARIANTS_MIN = 2
export const EXPLORE_VARIANTS_MAX = 5

export function GameSetup({
  initial,
  maiaOnline,
  onStart,
  onChange,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  initial: Setup
  maiaOnline: boolean | null
  onStart: (setup: Setup) => void
  onChange?: (setup: Setup) => void
  onCancel?: () => void
  cancelLabel?: string
}) {
  const [draft, setDraft] = useState<Setup>(() => ({ ...initial, opponent: 'maia' }))
  const firstRender = useRef(true)
  const patch = (changes: Partial<Setup>) => setDraft((prev) => ({ ...prev, ...changes }))

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onChange?.(draft)
  }, [draft, onChange])

  return (
    <div className="setup">
      <CollapsibleSection title="New game" summary="Maia" className="new-game-section">
        {maiaOnline === false && (
          <p className="warn">
            🔴 The Maia server isn't answering. Start it with <code>python server/app.py</code>.
          </p>
        )}

        <div className="setup-compact-content">
          <div className="setup-compact-row">
            <span className="setup-compact-label">Play as</span>
            <div className="segmented colors">
              <button className={draft.playerColor === 'w' ? 'active' : ''} onClick={() => patch({ playerColor: 'w' })}>
                ♔ White
              </button>
              <button className={draft.playerColor === 'b' ? 'active' : ''} onClick={() => patch({ playerColor: 'b' })}>
                ♚ Black
              </button>
              <button onClick={() => patch({ playerColor: Math.random() < 0.5 ? 'w' : 'b' })}>Random</button>
            </div>
          </div>

          <div className="setup-compact-row">
            <span className="setup-compact-label">Time</span>
            <div className="tc-grid">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.label}
                  className={draft.timeControl.label === tc.label ? 'active' : ''}
                  onClick={() => patch({ timeControl: tc })}
                  title={tc.label}
                  aria-label={tc.label}
                >
                  {compactTimeLabel(tc)}
                </button>
              ))}
            </div>
          </div>
        </div>

          <div className="setup-compact-row">
            <span className="setup-compact-label">Mode</span>
            <div className="segmented mode">
              <button
                className={!draft.explore ? 'active' : ''}
                onClick={() => patch({ explore: false })}
              >
                Play
              </button>
              <button
                className={draft.explore ? 'active' : ''}
                onClick={() => patch({ explore: true })}
                title="After each of your moves, pick which of the opponent's replies to follow — explore the branch, then continue from the first variant"
              >
                Explore
              </button>
            </div>
            {draft.explore && (
              <div className="explore-variants">
                <button
                  onClick={() =>
                    patch({ exploreVariants: Math.max(EXPLORE_VARIANTS_MIN, draft.exploreVariants - 1) })
                  }
                  aria-label="Fewer variants"
                >
                  −
                </button>
                <span>{draft.exploreVariants} variants</span>
                <button
                  onClick={() =>
                    patch({ exploreVariants: Math.min(EXPLORE_VARIANTS_MAX, draft.exploreVariants + 1) })
                  }
                  aria-label="More variants"
                >
                  +
                </button>
              </div>
            )}
          </div>

          <div className="setup-actions">
          <button className="primary" onClick={() => onStart(draft)}>
            Start game
          </button>
          {onCancel && <button onClick={onCancel}>{cancelLabel}</button>}
        </div>
      </CollapsibleSection>
    </div>
  )
}
