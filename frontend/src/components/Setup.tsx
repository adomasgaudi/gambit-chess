/** The "new game" form: opponent, strength, colour, time control. */

import { useState } from 'react'
import { MAIA_RATINGS } from '../engines/maia'
import { PACE_LABELS, type Pace } from '../chess/thinkTime'
import './Setup.css'

export type Opponent = 'stockfish' | 'maia' | 'human'

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

/** Stockfish's UCI_Elo floor is 1320; below that we'd be lying about strength. */
export const STOCKFISH_LEVELS = [1320, 1500, 1700, 1900, 2100, 2300, 2500, 2800, 3000]

export interface Setup {
  opponent: Opponent
  playerColor: 'w' | 'b'
  stockfishElo: number
  maiaRating: number
  /** How long Maia pretends to think — it decides instantly on its own. */
  maiaPace: Pace
  timeControl: TimeControl
}

export function GameSetup({
  initial,
  maiaOnline,
  onStart,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  initial: Setup
  maiaOnline: boolean | null
  onStart: (setup: Setup) => void
  onCancel?: () => void
  cancelLabel?: string
}) {
  const [draft, setDraft] = useState<Setup>(initial)
  const patch = (changes: Partial<Setup>) => setDraft((prev) => ({ ...prev, ...changes }))

  return (
    <div className="setup">
      <h2>New game</h2>

      <div className="field">
        <label>Opponent</label>
        <div className="segmented">
          {(['stockfish', 'maia', 'human'] as Opponent[]).map((opponent) => (
            <button
              key={opponent}
              className={draft.opponent === opponent ? 'active' : ''}
              onClick={() => patch({ opponent })}
            >
              {opponent === 'stockfish' ? 'Stockfish' : opponent === 'maia' ? 'Maia' : 'Two players'}
            </button>
          ))}
        </div>
      </div>

      {draft.opponent === 'stockfish' && (
        <div className="field">
          <label>
            Strength <span className="value">{draft.stockfishElo >= 3000 ? 'Full strength' : `${draft.stockfishElo} Elo`}</span>
          </label>
          <input
            type="range"
            min={0}
            max={STOCKFISH_LEVELS.length - 1}
            value={STOCKFISH_LEVELS.indexOf(draft.stockfishElo)}
            onChange={(event) => patch({ stockfishElo: STOCKFISH_LEVELS[Number(event.target.value)] })}
          />
          <p className="hint">
            Stockfish 18 running as WebAssembly in this tab. It plays the best move it can find —
            capped strength makes it weaker, not more human.
          </p>
        </div>
      )}

      {draft.opponent === 'maia' && (
        <div className="field">
          <label>
            Rating <span className="value">{draft.maiaRating}</span>
          </label>
          <input
            type="range"
            min={0}
            max={MAIA_RATINGS.length - 1}
            value={MAIA_RATINGS.indexOf(draft.maiaRating as (typeof MAIA_RATINGS)[number])}
            onChange={(event) => patch({ maiaRating: MAIA_RATINGS[Number(event.target.value)] })}
          />
          <p className="hint">
            Maia predicts the move a human of this rating would actually play, blunders included.
            Each rating is its own neural network, run through lc0.
          </p>

          <label className="sub-label">Thinking time</label>
          <div className="segmented">
            {(Object.keys(PACE_LABELS) as Pace[]).map((pace) => (
              <button
                key={pace}
                className={draft.maiaPace === pace ? 'active' : ''}
                onClick={() => patch({ maiaPace: pace })}
              >
                {PACE_LABELS[pace]}
              </button>
            ))}
          </div>
          <p className="hint">
            Maia decides in about a millisecond, so its clock never moves. Human pace spends time
            the way a player does — quick out of the opening, longer in the middlegame, faster when
            short on time.
          </p>
          {maiaOnline === false && (
            <p className="warn">
              🔴 The Maia server isn't answering. Start it with <code>python server/app.py</code>.
            </p>
          )}
        </div>
      )}

      <div className="field">
        <label>Play as</label>
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

      <div className="field">
        <label>Time control</label>
        <div className="tc-grid">
          {TIME_CONTROLS.map((tc) => (
            <button
              key={tc.label}
              className={draft.timeControl.label === tc.label ? 'active' : ''}
              onClick={() => patch({ timeControl: tc })}
            >
              {tc.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setup-actions">
        <button className="primary" onClick={() => onStart(draft)}>
          Start game
        </button>
        {onCancel && <button onClick={onCancel}>{cancelLabel}</button>}
      </div>
    </div>
  )
}
