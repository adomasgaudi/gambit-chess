export interface ChangelogEntry {
  version: string
  title: string
  summary: string
  detail?: string
}

/** Newest first; APP_VERSION is deliberately derived from this list. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v59',
    title: 'Explore mode, Stockfish in analysis, and openings that nest',
    summary: 'Explore mode offers the opponent\'s top replies after each of your moves; the Analysis tab hosts the move list, a live Stockfish card, and per-move Maia scores; openings nest under each move and the one you are in sits at the top.',
    detail:
      'A new Explore mode pauses on the opponent\'s turn and offers its top policy replies — choose how many in the setup (two to five). Pick a variant to follow it, or Continue from the first to keep the main line; the move list records the explored line like any other. The sidebar drops the Moves tab: the move list lives inside Analysis now, with its Maia 2500 and Stockfish badge toggles. Analysis also gains a live Stockfish card — current-position score and best move from the browser WASM build — and the one-band rows now always show the after-move Maia score of the chosen band and the Stockfish score, independent of the history badge toggles, which was the bug leaving them blank. Each one-band row nests the openings the move adds, most general first, and the opening chain already locked in by the history is drawn once above the list instead of repeated on every row. The Instant thinking pace becomes Fast, a sub-second delay.',
  },
  {
    version: 'v58',
    title: 'A move list that tells the story of the game',
    summary: 'Sidebar sections become tabs; moves show Maia chance, Maia score and Stockfish score everywhere, and openings label every line.',
    detail:
      'The sidebar is now four tabs — Play, Moves, Board, Analysis — instead of a stack of collapsible sections. The move chance and Maia score are no longer two display modes you switch between: every value in the analysis cards and rows shows both at once. The one-band rows add the score of the position after each candidate move — Maia and Stockfish both answer, the Stockfish WASM worker jumping the queue so the rows fill in quickly — and each row names the opening it leads to. The Moves list can do the same for the moves actually played, at two significant figures so a 0.4% blunder no longer rounds to 0%. Stockfish needed cross-origin isolation and a module worker to run at all; the dev server now sends the COOP/COEP headers that make its shared-memory build legal, and browsing the move list no longer re-asks every position.',
  },
  {
    version: 'v57',
    title: 'What Maia 2500 thinks of your game',
    summary: 'Each move in the history can now show the probability that the Maia 2500 band would play it.',
    detail:
      'The Moves list gains a Maia 2500 toggle. When it is on, every position in the game is asked what the 2500 band\'s policy head thinks of the move that was actually played there, and the percentage appears next to each move — the rows fill in as the answers arrive, four at a time. A move nobody would consider shows a small number; a natural move shows a large one. The server\'s move endpoint now returns the whole policy with each answer, so no extra round trips are needed. The 3D board also sheds the glass and neon styles in favour of a warmer marble, lifts dragged pieces just high enough to see they are in hand, slims the frame around the squares, and softens its shadows so pieces sit on the surface instead of floating over it.',
  },
  {
    version: 'v56',
    title: 'Flat annotations, board palettes, and a richer engine panel',
    summary: '3D annotations lie flat like the 2D board, pieces are invisible to the mouse, four board palettes and four 3D piece styles, and the Maia panel reports every move, the worst move, and the picked piece\'s moves alone.',
    detail:
      'The 3D board now paints every annotation — square tints, the check glow, move dots and capture rings, engine arrows — on a single transparent sheet lying flat on the squares, in the exact colours of the flat board. No more floating cylinders and cones. Picking is answered by the board squares alone, so a piece\'s outline can never grab a click meant for the square behind it. Board colours gain four palettes — Wood, Emerald, Ocean, Midnight — that restyle the 2D board and the 3D board together, and the 3D piece styles become a family: turned wood, glossy marble, clear glass, and neon pieces that glow (best on Midnight). The Maia panel now shows how many legal moves the position has and the worst of them at the bottom, and clicking a piece on the board opens a second, separate list of that piece\'s top moves while the all-pieces list stays as it was. The evaluation bar and the engine\'s best-move arrow each get their own on/off switch, independent of the analysis toggle. The panel also shows the five bands from the same request as the move lists, so the totals are never stale.',
  },
  {
    version: 'v55',
    title: 'A camera you can lock',
    summary: 'The 3D board stays fixed while you play; a Pan/zoom toggle on the board unlocks turning, panning, and zooming.',
    detail:
      'Orbit and piece-dragging are both left-drag, so a free camera kept moving the board under your pieces. The 3D board now starts locked: the camera stands still and drags only move pieces. The Pan/zoom button beside ⟳ View unlocks the camera — drag to turn, right-drag to pan, scroll to zoom — and the choice is remembered. While a piece is in hand the camera stands down even when unlocked, so grabbing a piece can never fling the view.',
  },
  {
    version: 'v54',
    title: 'Insights',
    summary: 'A new page that counts your own Lichess games: rating, record, endings, openings, and when you play.',
    detail:
      'The link under the home page cards opens Insights, built from a Lichess PGN export parsed by scripts/parse_lichess_pgn.py into src/data/games.ts. Rating after every rated game is drawn per speed on one scale; below it, record by speed, colour and ending, the distribution of game lengths against the score at each length, the score by how far the opponent was rated above or below you, the opening families you actually reach as each colour, and a weekday-by-hour map of when you sit down. Filters for speed, colour and rated narrow every chart at once, and the whole export is listed underneath as a table, each row linking back to the game on Lichess. A plain export carries no clocks and no evaluations, so the page says nothing about time trouble or blunders — everything on it is countable from the moves and the tags.',
  },
  {
    version: 'v53',
    title: 'A real 3D board',
    summary: 'The 3D style is now an actual scene — real geometry, real lights, a camera you can fly anywhere.',
    detail:
      'The sprite illusion is gone, along with the images it needed. Choosing 3D now loads a WebGL scene: each piece is real geometry built in code — a turned profile revolved on a lathe for everything but the knight, whose head is an extruded carved profile — lit by a key light that casts real shadows onto the board. Drag to turn all the way around, right-drag to pan, scroll to zoom, and ⟳ View puts the camera back behind your side. Pieces are picked by raycast, so grabbing a tall piece from any angle works, and dragging one lifts it off the board. three.js is loaded only when the style is selected, so the flat board stays as light as it was.',
  },
  {
    version: 'v52',
    title: 'A board you can look at from an angle',
    summary: 'A rendered wooden piece set, and a camera you can raise and lower.',
    detail:
      'The 3D style now uses a real rendered set rather than the flat artwork with shadows under it. The pieces are ray-marched from signed distance fields by scripts/render_pieces.py — our own geometry, so no downloaded art and no licence to honour, and the camera is ours to move. The board tips away from the viewer and each piece stands back up out of it, hinged on the square it occupies, which is why raising the camera reveals the ranks behind instead of flattening them. A slider sets the angle from 10° to 55°, and the piece set is re-rendered at four elevations so the lighting and foreshortening always match the camera in use. Clicks and drags are hit-tested against the squares themselves, so a tilted board stays exactly as accurate as a flat one.',
  },
  {
    version: 'v51',
    title: '3D pieces, and coins that are coins',
    summary: 'Piece style is now a three-way choice, and the coin style finally draws a disk.',
    detail:
      'Classic, Coin, and 3D replace the old on/off coin switch. 3D scales the same artwork up onto its base, adds a contact shadow, and paints nearer ranks last so pieces overhang the rank behind them; the clickable square is unchanged, so dragging behaves exactly as before. The coin style never actually rendered a disk: its background and border were written for a class the board did not put on the piece, leaving only a slightly shrunken flat piece. A stored coin preference carries over to the new Coin style.',
  },
  {
    version: 'v50',
    title: 'One band, many moves',
    summary: 'Study a single Maia band\'s top moves, and fix analysis that never left the starting position.',
    detail:
      'The Maia panel now switches between the five-band comparison and a single-band view: pick 600, 1000, 1500, 2000, or 2500 and choose how many of that model\'s most likely moves to list, ranked with probability bars. Both the band and the count are remembered. Analysis also sent lc0 the position at the cursor together with the moves that produced it, which lc0 rejected — so every band kept answering for the opening position no matter what was on the board. It now receives the game\'s root position, as live play always did.',
  },
  {
    version: 'v49',
    title: 'Hover arrows and honest candidates',
    summary: 'Hovering any Maia move draws it on the board, and the fake "node" candidate is gone.',
    detail:
      'Every move in the Maia panel — each band\'s top move and its policy candidates — draws a gold arrow on the board while the cursor or keyboard focus is on it. The server no longer mistakes lc0\'s root summary line for a move, so "node" is no longer listed as a candidate with the top move\'s probability. Versions are now numbered v1, v2, v3 rather than v0.1.0.',
  },
  {
    version: 'v48',
    title: 'Analysis-style pre-game',
    summary: 'Explore both sides before starting, then keep the edited position and move history in the game.',
    detail:
      'The pre-game board now accepts moves for White and Black and treats the visible cursor as the position being prepared. Starting the game preserves that mainline instead of resetting to the initial board, while live Maia play keeps its normal turn and clock restrictions.',
  },
  {
    version: 'v47',
    title: 'Visible coin disks',
    summary: 'Make coin mode show a real circular disk instead of enlarging the normal piece artwork.',
    detail:
      'The coin wrapper now stays visibly round, clips its contents, and keeps the emblem inset inside the disk. The generic full-size piece-image rule no longer overrides the coin emblem sizing, so switching styles produces an unmistakable white or black disk.',
  },
  {
    version: 'v46',
    title: 'Versioned updates button',
    summary: 'Show the current app version directly on the floating updates button.',
  },
  {
    version: 'v45',
    title: 'Coin piece style',
    summary: 'Make the piece-style switch render side-coloured coin pieces instead of a board overlay.',
    detail:
      'The old Circles control is now a separate Piece style setting. When enabled, every piece becomes a white or black round disk with a high-contrast pawn, knight, bishop, rook, queen, or king emblem centered inside. Defender arrows remain an independent board overlay.',
  },
  {
    version: 'v44',
    title: 'Persistent preferences',
    summary: 'Remember setup, orientation, display, theme, sound, and overlay choices immediately.',
    detail:
      'New-game colour and time choices are saved as they change instead of waiting for Start. Board orientation is now remembered too, alongside Maia settings, evaluation display, theme, sound, and overlays.',
  },
  {
    version: 'v43',
    title: 'Reliable Maia reconnects',
    summary: 'Retry Maia health checks and resume evaluations after delayed startup.',
    detail:
      'The frontend now polls Maia while offline and backs off once it is healthy. Analysis waits for recovery and automatically requests the current position again, so starting both processes together no longer leaves the panel stuck offline.',
  },
  {
    version: 'v42',
    title: 'Maia-only evaluations',
    summary: 'Show five human-style Maia bands with probability and Maia-score views.',
    detail:
      'Every position now asks Maia policy networks at 600, 1000, 1500, 2000, and 2500 bands. The analysis toggle switches between the chosen move’s policy chance and a Maia root-value score, with Stockfish and cloud evaluations removed.',
  },
  {
    version: 'v41',
    title: 'Restored coin pieces',
    summary: 'Bring back filled coin-style pieces with centered emblems when Circles is enabled.',
    detail:
      'Circles mode now renders every piece as a filled, side-colored coin while retaining its normal pawn, knight, bishop, rook, queen, or king emblem inside. The coin keeps the established six-percent inset and uses separate light and dark treatments for clear contrast.',
  },
  {
    version: 'v40',
    title: 'Actions beside setup',
    summary: 'Move game actions directly below the new-game settings for faster access.',
    detail:
      'Game actions now sit at the top of the sidebar with New game settings. Moves, board overlays, and engine analysis remain grouped below, while every action and menu option keeps its existing behavior.',
  },
  {
    version: 'v39',
    title: 'Complete engine branches',
    summary: 'Remove settings explanations and compute all requested lines beyond the cloud limit.',
    detail:
      'The engine settings panel now shows only controls. Lichess cloud evaluations still supply up to five cached branches, while requests for more lines automatically use local Stockfish so the selected count can actually be displayed.',
  },
  {
    version: 'v38',
    title: 'Restored piece circles',
    summary: 'Bring back the original perimeter circles with theme-colored outlines.',
    detail:
      'Circles mode now keeps the normal piece artwork and draws a clean ring at the previous six-percent inset. The outline uses the active theme accent instead of the old red defense color, preserving the earlier size and placement without turning pieces into filled coins.',
  },
  {
    version: 'v37',
    title: 'Compact pre-game setup',
    summary: 'Fit color, time, and start controls into a single dense setup strip.',
    detail:
      'The pre-game form removes nested panels and oversized option buttons. Color choices, six time controls, and the action buttons now share a compact layout that preserves the same choices while using a fraction of the previous vertical space.',
  },
  {
    version: 'v36',
    title: 'Cleaner sidebar',
    summary: 'Remove redundant game metadata and navigation controls from the sidebar.',
    detail:
      'The sidebar now starts with the move list and keeps navigation on the keyboard: Left and Right step through moves, Up and Down jump to the ends, and F flips the board. The repeated opponent and time-control header has also been removed to give the controls more room.',
  },
  {
    version: 'v35',
    title: 'Black-side pre-game view',
    summary: 'Flip the pre-game board immediately when Black is selected, and label the setup screen.',
    detail:
      'Selecting Black now reorients the board while the setup panel is still open, so the pre-game analyser matches the side you chose before the first move. The top bar labels this state “pre-game” to make the current phase explicit.',
  },
  {
    version: 'v34',
    title: 'Collapsible sections',
    summary: 'Collapse setup, board, analysis, and action sections to keep the sidebar compact.',
    detail:
      'Every major control group now has a consistent expandable header with a live summary. Maia Elo and thinking time, new-game settings, moves, navigation, board overlays, engine evaluation, and game actions can all be tucked away without losing access to their current state.',
  },
  {
    version: 'v33',
    title: 'Inline Maia settings',
    summary: 'Keep Maia Elo and thinking controls collapsed inside the existing player strip.',
    detail:
      'Maia settings no longer add a tall block above the board. Both controls start collapsed beside Maia’s name, and each expands only when its heading is clicked.',
  },
  {
    version: 'v32',
    title: 'Compact Maia row',
    summary: 'Fit Maia controls into the existing player strip instead of adding a new board row.',
    detail:
      'The Elo slider and thinking button now sit inline beside Maia’s player information. The board keeps its original vertical rhythm, and the three pace choices still open in a small popover.',
  },
  {
    version: 'v31',
    title: 'Maia board controls',
    summary: 'Move Maia Elo and thinking controls above the board for setup and live play.',
    detail:
      'The sidebar setup now focuses on colour and time control. Maia Elo stays adjustable on the Maia board row, while thinking pace remains available from its compact settings button and uses the same selected values before and after Start.',
  },
  {
    version: 'v30',
    title: 'Gap-based arrows',
    summary: 'Color engine arrows according to whether each line falls within the configured gap.',
    detail:
      'The best move and every candidate inside the selected pawn gap now share the green primary arrow. A hovered candidate outside that gap uses the alternate color, so arrow styling communicates the setting instead of ranking every non-best move as an alternative.',
  },
  {
    version: 'v29',
    title: 'Visible white arrows',
    summary: 'Add a dark halo so white relationship arrows stay readable on pale squares.',
  },
  {
    version: 'v28',
    title: 'Expanded king halo',
    summary: 'Make the king protection circle more prominent while keeping it compact.',
  },
  {
    version: 'v27',
    title: 'Side-colored coins',
    summary: 'White and black pieces now use matching white and black coin shapes.',
    detail:
      'Circles mode uses light coins with dark-outlined white emblems for White and dark coins with inverted light emblems for Black. The two sides remain uniform, distinct, and readable without the earlier red fill.',
  },
  {
    version: 'v26',
    title: 'Defense and attack markers',
    summary: 'Use side-colored lines, defense dots, and red arrowheads for attacks.',
    detail:
      'White-target relationships use white lines and black-target relationships use black lines. Friendly protection ends in a small circle, enemy attacks end in a red arrowhead, and king protection remains represented by the king halo.',
  },
  {
    version: 'v25',
    title: 'Attack arrows',
    summary: 'Show enemy attacks too while keeping king protection represented by a circle.',
    detail:
      'Defense mode now draws arrows for both friendly protection and enemy control. Friendly arrows to a king are omitted because a king cannot be recaptured, king-origin arrows remain suppressed, and enemy arrows use the danger color for distinction.',
  },
  {
    version: 'v24',
    title: 'Manual Maia reply',
    summary: 'Ask Maia to respond from the pre-game board without starting the clock.',
    detail:
      'Before timed play begins, make a move on the board and use Maia responds in the sidebar. Maia uses the selected setup settings, answers the position, and leaves the clock stopped until Start game is pressed.',
  },
  {
    version: 'v23',
    title: 'Visible coin emblems',
    summary: 'Keep every coin smaller, centered, and visibly marked with its piece emblem.',
    detail:
      'Circles mode now uses an inset coin element with a dedicated centered image instead of painting the entire piece wrapper red. This preserves the uniform circular silhouette while keeping each pawn, rook, knight, bishop, queen, and king recognizable.',
  },
  {
    version: 'v22',
    title: 'Focused Maia play',
    summary: 'Keep game tools available before starting while removing separate analysis controls.',
    detail:
      'The Maia setup now shares the sidebar with navigation, overlays, engine evaluation, and actions. Time control stays collapsed behind Play on time, while the Analysis nav entry and Maia Elo navbar slider are removed.',
  },
  {
    version: 'v21',
    title: 'Uniform piece coins',
    summary: 'Circles mode turns every piece into a filled coin with its emblem inside.',
    detail:
      'The optional circles display now uses the normal piece images as emblems inside identical red, shaded coin shapes. Every piece gets the same circular silhouette while pawns, rooks, knights, bishops, queens, and kings remain identifiable.',
  },
  {
    version: 'v20',
    title: 'Focused Maia play',
    summary: 'Keep game tools available before starting while removing separate analysis controls.',
    detail:
      'The Maia setup now shares the sidebar with navigation, overlays, engine evaluation, and actions. Time control stays collapsed behind Play on time, while the Analysis nav entry and Maia Elo navbar slider are removed.',
  },
  {
    version: 'v19',
    title: 'Larger king halo',
    summary: 'Give the king protection ring more breathing room without returning to the wide aura.',
  },
  {
    version: 'v18',
    title: 'Subtle king ring',
    summary: 'Keep the king protection ring only slightly larger than its piece circle.',
    detail:
      'The king-specific protection marker is now a tight halo rather than a wide area circle, keeping the symbol visible without dominating the board or implying a large covered zone.',
  },
  {
    version: 'v17',
    title: 'King protection aura',
    summary: 'Kings use a red protection circle instead of arrows to nearby pieces.',
    detail:
      'Defense visualization now treats kings as area protectors: the king’s adjacent-square reach is shown by one red circle, while king-origin arrows are omitted. Other arrows use extra clearance so they avoid the visible piece bubbles.',
  },
  {
    version: 'v16',
    title: 'Maia main choice',
    summary: 'Make Maia the only main opponent, with Elo and clock choices in setup.',
    detail:
      'The landing page now presents Maia as the single primary game option. Stockfish remains reachable through the secondary analysis board for comparisons, while the new-game form keeps Maia Elo, colour, and time controls front and centre.',
  },
  {
    version: 'v15',
    title: 'Compact Maia setup',
    summary: 'Keep Maia pace choices hidden behind a settings button and remove setup explanations.',
    detail:
      'The setup form now focuses on the controls needed to start a game. Instant, Human, and Slow thinking remain available from the gear button, while the descriptive engine copy is removed.',
  },
  {
    version: 'v14',
    title: 'Live themes and Maia control',
    summary: 'Change Maia Elo during a game and switch between white and black themes anytime.',
    detail:
      'Maia games now keep a compact rating slider in the top bar, so the next reply can use a new strength without restarting. The brown palette is replaced by clean white and black themes, with subtle visual shifts for setup, live play, and analysis screens.',
  },
  {
    version: 'v13',
    title: 'Straighter defense paths',
    summary: 'Defense arrows stay straight unless another piece blocks their direct route.',
    detail:
      'The arrow router now checks the direct segment first. It uses a curved detour only when the segment intersects an occupied piece, keeping clear relationships simple and reducing visual clutter across the board.',
  },
  {
    version: 'v11',
    title: 'Piece circles',
    summary: 'Toggle subtle perimeter circles around every occupied piece on the board.',
    detail:
      'A separate Circles option now draws light-red rings around the current pieces. Defender arrows remain independent, thinner, more opaque, and scaled to keep their heads from overwhelming the board.',
  },
  {
    version: 'v10',
    title: 'More engine lines',
    summary: 'Show up to ten engine variations when comparing candidate moves.',
    detail:
      'The Lines control now accepts values from one through ten, and remembered settings are validated against the same upper bound. Focused piece searches and alternative arrows also request enough principal variations to support the expanded list.',
  },
  {
    version: 'v9',
    title: 'Opening evaluation',
    summary: 'Engine evaluation now appears on the starting position before the first move.',
    detail:
      'Live analysis now waits for the game screen to open and re-runs when a new game leaves setup. This keeps the initial position from losing its evaluation when the old lines are cleared while the FEN remains unchanged.',
  },
  {
    version: 'v8',
    title: 'Defender arrows',
    summary: 'Trace each defended piece back to every friendly piece protecting it.',
    detail:
      'The defenders overlay draws thin, light-red curves between the imaginary perimeters of each friendly defender and the piece it protects. Routes bend around occupied squares, and the arrow layer sits beneath pieces to keep the board readable.',
  },
  {
    version: 'v7',
    title: 'Alternative arrows',
    summary: 'Choose a pawn gap and see every engine move within it on the board.',
    detail:
      'The engine now searches extra candidate lines when the arrow gap is above zero. The board keeps the best move green and marks qualifying alternatives gold, while the Lines setting still controls how many variations the panel lists.',
  },
  {
    version: 'v6',
    title: 'Remembered choices',
    summary: 'Your game and analysis preferences now return the next time Gambit opens.',
    detail:
      'Strength, colour, time control, engine settings, sound, and the defenders overlay are stored locally in the browser. Values are validated when read so an old or edited preference cannot break the app.',
  },
  {
    version: 'v5',
    title: 'Engine guidance',
    summary: 'Review now separates tactical punishment from slower strategic losses.',
  },
]

export const APP_VERSION = CHANGELOG[0].version
