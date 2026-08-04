/**
 * The landing page: pick what kind of game this is going to be.
 *
 * Choosing a card doesn't start anything — it opens the options panel next to
 * the board with that mode already selected, so strength and time control are
 * still one screen away rather than buried behind a default.
 */

import type { Opponent } from './Setup'
import './Landing.css'

export type LandingChoice = Opponent | 'analysis'

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

const analysisArt = (
  <div className="card-art board-art">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <g fill="var(--square-dark)">
        <rect x="0" y="0" width="12" height="12" />
        <rect x="24" y="0" width="12" height="12" />
        <rect x="12" y="12" width="12" height="12" />
        <rect x="36" y="12" width="12" height="12" />
        <rect x="0" y="24" width="12" height="12" />
        <rect x="24" y="24" width="12" height="12" />
        <rect x="12" y="36" width="12" height="12" />
        <rect x="36" y="36" width="12" height="12" />
      </g>
      <path
        d="M13 35 L33 15"
        stroke="var(--arrow)"
        strokeWidth="5"
        strokeLinecap="round"
        markerEnd="url(#landing-arrow)"
      />
      <defs>
        <marker id="landing-arrow" orient="auto" markerWidth="3" markerHeight="3.6" refX="1.2" refY="1.8">
          <path d="M0,0 V3.6 L2.6,1.8 Z" fill="var(--arrow)" />
        </marker>
      </defs>
    </svg>
  </div>
)

const CARDS: Card[] = [
  {
    choice: 'stockfish',
    title: 'Stockfish',
    tagline: '1320 – full strength',
    blurb:
      'The strongest engine there is, compiled to WebAssembly and running in this tab. Cap its rating and it plays worse — not more human.',
    art: pieceArt('wQ'),
  },
  {
    choice: 'maia',
    title: 'Maia',
    tagline: '1100 – 1900 rated',
    blurb:
      'Nine neural networks, one per rating band, trained to predict the move a human of that rating actually played. It blunders like one too.',
    art: pieceArt('bN'),
  },
  {
    choice: 'human',
    title: 'Two players',
    tagline: 'One board, one screen',
    blurb: 'Pass and play against someone next to you, with real clocks and a full move list.',
    art: pieceArt('wP', 'bP'),
  },
  {
    choice: 'analysis',
    title: 'Analysis board',
    tagline: 'Any position',
    blurb:
      'Play both sides, load a FEN, walk the variations, and let Stockfish score every line as you go.',
    art: analysisArt,
  },
]

export function Landing({
  maiaOnline,
  hasGameInProgress,
  onChoose,
  onResume,
}: {
  maiaOnline: boolean | null
  hasGameInProgress: boolean
  onChoose: (choice: LandingChoice) => void
  onResume: () => void
}) {
  return (
    <div className="landing">
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
          <div>Stockfish 18 runs in the browser. Maia runs on lc0 through the local server.</div>
          <div className="landing-version">Gambit v{__APP_VERSION__}</div>
        </footer>
      </div>
    </div>
  )
}
