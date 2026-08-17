/**
 * The landing page: start a Maia game.
 *
 * Choosing a card doesn't start anything — it opens the options panel next to
 * Maia is the only playable opponent; engine analysis lives inside that game.
 */

import type { Theme } from '../prefs'
import { Changelog } from './Changelog'
import { ThemePicker } from './ThemePicker'
import './Landing.css'

export type LandingChoice = 'maia'

interface Card {
  choice: LandingChoice
  title: string
  tagline: string
  blurb: string
  art: React.ReactNode
}

/**
 * Card art sits on a board-coloured tile. Cburnett pieces are drawn to be seen
 * against a light square — put a black knight straight onto the page's dark
 * background and it very nearly vanishes.
 */
const pieceArt = (...pieces: string[]) => (
  <div className="card-art piece-art">
    {pieces.map((piece) => (
      <img key={piece} src={`/piece/${piece}.svg`} alt="" />
    ))}
  </div>
)

const CARDS: Card[] = [
  {
    choice: 'maia',
    title: 'Maia',
    tagline: 'Choose your Elo and time',
    blurb: 'Play a human-like opponent with a rating and clock that fit the game you want to play.',
    art: pieceArt('bN'),
  },
]

export function Landing({
  maiaOnline,
  hasGameInProgress,
  theme,
  onChoose,
  onResume,
  onInsights,
  onThemeChange,
}: {
  maiaOnline: boolean | null
  hasGameInProgress: boolean
  theme: Theme
  onChoose: (choice: LandingChoice) => void
  onResume: () => void
  onInsights: () => void
  onThemeChange: (theme: Theme) => void
}) {
  return (
    <div className={`landing theme-${theme}`}>
      <div className="landing-inner">
        <header className="landing-head">
          <h1>
            <span className="brand-mark">♞</span> Gambit
          </h1>
          <p>
            Play a machine that plays <em>well</em>, or one that plays <em>human</em>.
          </p>
          {hasGameInProgress && (
            <button className="resume" onClick={onResume}>
              ← Back to your game
            </button>
          )}
          <ThemePicker theme={theme} onChange={onThemeChange} />
        </header>

        <div className="landing-cards">
          {CARDS.map((card) => {
            const offline = card.choice === 'maia' && maiaOnline === false
            return (
              <button key={card.choice} className="mode-card" onClick={() => onChoose(card.choice)}>
                {card.art}
                <div className="card-title">
                  {card.title}
                  {card.choice === 'maia' && (
                    <span className={`card-dot ${offline ? 'off' : maiaOnline ? 'on' : ''}`} />
                  )}
                </div>
                <div className="card-tagline">{card.tagline}</div>
                <p className="card-blurb">{card.blurb}</p>
                {offline && <div className="card-warn">Server offline — run python server/app.py</div>}
              </button>
            )
          })}
        </div>

        <footer className="landing-foot">
          <button className="landing-link" onClick={onInsights}>
            Insights — your Lichess games, counted →
          </button>
          <div className="landing-version">Gambit {__APP_VERSION__}</div>
        </footer>
      </div>
      <Changelog />
    </div>
  )
}
