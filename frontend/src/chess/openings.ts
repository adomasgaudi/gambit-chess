/**
 * A small opening book: SAN move sequence → ECO code and name.
 *
 * Nowhere near a full ECO database — it covers the lines a club player actually
 * reaches, which is all the analysis panel needs to say "you're in a Najdorf".
 * Lookup takes the longest prefix that matches the game.
 */

type Entry = [moves: string, eco: string, name: string]

const BOOK: Entry[] = [
  // --- First moves -------------------------------------------------------
  ['e4', 'B00', "King's Pawn Game"],
  ['d4', 'A40', "Queen's Pawn Game"],
  ['Nf3', 'A04', 'Réti Opening'],
  ['c4', 'A10', 'English Opening'],
  ['g3', 'A00', "King's Fianchetto Opening"],
  ['b3', 'A01', 'Nimzo-Larsen Attack'],
  ['f4', 'A02', "Bird's Opening"],
  ['b4', 'A00', 'Polish Opening'],
  ['Nc3', 'A00', 'Van Geet Opening'],

  // --- 1.e4 replies ------------------------------------------------------
  ['e4 e5', 'C20', "King's Pawn Game"],
  ['e4 c5', 'B20', 'Sicilian Defence'],
  ['e4 e6', 'C00', 'French Defence'],
  ['e4 c6', 'B10', 'Caro-Kann Defence'],
  ['e4 d5', 'B01', 'Scandinavian Defence'],
  ['e4 d6', 'B07', 'Pirc Defence'],
  ['e4 Nf6', 'B02', 'Alekhine Defence'],
  ['e4 g6', 'B06', 'Modern Defence'],
  ['e4 Nc6', 'B00', 'Nimzowitsch Defence'],
  ['e4 b6', 'B00', 'Owen Defence'],

  // --- Open games --------------------------------------------------------
  ['e4 e5 Nf3', 'C40', "King's Knight Opening"],
  ['e4 e5 Nf3 Nc6', 'C44', "King's Knight Opening"],
  ['e4 e5 Nf3 Nc6 Bb5', 'C60', 'Ruy López'],
  ['e4 e5 Nf3 Nc6 Bb5 a6', 'C70', 'Ruy López: Morphy Defence'],
  ['e4 e5 Nf3 Nc6 Bb5 a6 Ba4', 'C70', 'Ruy López: Morphy Defence'],
  ['e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6', 'C78', 'Ruy López: Morphy Defence'],
  ['e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7', 'C84', 'Ruy López: Closed'],
  ['e4 e5 Nf3 Nc6 Bb5 a6 Bxc6', 'C68', 'Ruy López: Exchange Variation'],
  ['e4 e5 Nf3 Nc6 Bb5 Nf6', 'C65', 'Ruy López: Berlin Defence'],
  ['e4 e5 Nf3 Nc6 Bc4', 'C50', 'Italian Game'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'C50', 'Italian Game: Giuoco Piano'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5 b4', 'C51', 'Evans Gambit'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6', 'C55', 'Italian Game: Two Knights Defence'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5', 'C57', 'Two Knights: Fried Liver Attack'],
  ['e4 e5 Nf3 Nc6 d4', 'C44', 'Scotch Game'],
  ['e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'C45', 'Scotch Game'],
  ['e4 e5 Nf3 Nc6 Nc3', 'C46', 'Three Knights Opening'],
  ['e4 e5 Nf3 Nc6 Nc3 Nf6', 'C47', 'Four Knights Game'],
  ['e4 e5 Nf3 Nf6', 'C42', 'Petrov Defence'],
  ['e4 e5 Nf3 d6', 'C41', 'Philidor Defence'],
  ['e4 e5 Nf3 f5', 'C40', 'Latvian Gambit'],
  ['e4 e5 f4', 'C30', "King's Gambit"],
  ['e4 e5 f4 exf4', 'C33', "King's Gambit Accepted"],
  ['e4 e5 f4 Bc5', 'C30', "King's Gambit Declined"],
  ['e4 e5 Bc4', 'C23', "Bishop's Opening"],
  ['e4 e5 Nc3', 'C25', 'Vienna Game'],
  ['e4 e5 d4', 'C21', 'Centre Game'],

  // --- Sicilian ----------------------------------------------------------
  ['e4 c5 Nf3', 'B27', 'Sicilian Defence'],
  ['e4 c5 Nf3 d6', 'B50', 'Sicilian Defence'],
  ['e4 c5 Nf3 Nc6', 'B30', 'Sicilian: Old Sicilian'],
  ['e4 c5 Nf3 e6', 'B40', 'Sicilian: French Variation'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3', 'B54', 'Sicilian: Open'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'B90', 'Sicilian: Najdorf'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', 'B70', 'Sicilian: Dragon'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', 'B56', 'Sicilian: Classical'],
  ['e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6', 'B44', 'Sicilian: Taimanov'],
  ['e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6', 'B42', 'Sicilian: Kan'],
  ['e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6', 'B34', 'Sicilian: Accelerated Dragon'],
  ['e4 c5 Nf3 Nc6 Bb5', 'B30', 'Sicilian: Rossolimo'],
  ['e4 c5 Nf3 d6 Bb5+', 'B51', 'Sicilian: Moscow Variation'],
  ['e4 c5 c3', 'B22', 'Sicilian: Alapin'],
  ['e4 c5 Nc3', 'B23', 'Sicilian: Closed'],
  ['e4 c5 d4', 'B21', 'Sicilian: Smith-Morra Gambit'],
  ['e4 c5 f4', 'B21', 'Sicilian: Grand Prix Attack'],

  // --- French, Caro-Kann, others -----------------------------------------
  ['e4 e6 d4', 'C00', 'French Defence'],
  ['e4 e6 d4 d5', 'C01', 'French Defence'],
  ['e4 e6 d4 d5 Nc3', 'C10', 'French: Paulsen Variation'],
  ['e4 e6 d4 d5 Nc3 Bb4', 'C15', 'French: Winawer'],
  ['e4 e6 d4 d5 Nc3 Nf6', 'C11', 'French: Classical'],
  ['e4 e6 d4 d5 Nd2', 'C03', 'French: Tarrasch'],
  ['e4 e6 d4 d5 e5', 'C02', 'French: Advance Variation'],
  ['e4 e6 d4 d5 exd5', 'C01', 'French: Exchange Variation'],
  ['e4 c6 d4', 'B12', 'Caro-Kann Defence'],
  ['e4 c6 d4 d5', 'B12', 'Caro-Kann Defence'],
  ['e4 c6 d4 d5 Nc3', 'B15', 'Caro-Kann: Main Line'],
  ['e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', 'B18', 'Caro-Kann: Classical'],
  ['e4 c6 d4 d5 e5', 'B12', 'Caro-Kann: Advance Variation'],
  ['e4 c6 d4 d5 exd5', 'B13', 'Caro-Kann: Exchange Variation'],
  ['e4 d5 exd5 Qxd5', 'B01', 'Scandinavian: Main Line'],
  ['e4 d5 exd5 Nf6', 'B01', 'Scandinavian: Modern Variation'],
  ['e4 Nf6 e5 Nd5', 'B03', 'Alekhine Defence'],
  ['e4 d6 d4 Nf6 Nc3 g6', 'B07', 'Pirc Defence'],

  // --- 1.d4 --------------------------------------------------------------
  ['d4 d5', 'D00', "Queen's Pawn Game"],
  ['d4 Nf6', 'A45', 'Indian Defence'],
  ['d4 f5', 'A80', 'Dutch Defence'],
  ['d4 d5 c4', 'D06', "Queen's Gambit"],
  ['d4 d5 c4 dxc4', 'D20', "Queen's Gambit Accepted"],
  ['d4 d5 c4 e6', 'D30', "Queen's Gambit Declined"],
  ['d4 d5 c4 c6', 'D10', 'Slav Defence'],
  ['d4 d5 c4 c6 Nf3 Nf6 Nc3 e6', 'D43', 'Semi-Slav Defence'],
  ['d4 d5 c4 e6 Nc3 Nf6 Bg5', 'D50', "Queen's Gambit Declined"],
  ['d4 d5 c4 e6 Nc3 c5', 'D32', 'Tarrasch Defence'],
  ['d4 d5 c4 Nc6', 'D07', 'Chigorin Defence'],
  ['d4 d5 c4 e5', 'D08', 'Albin Counter-Gambit'],
  ['d4 d5 Nf3 Nf6 Bf4', 'D02', 'London System'],
  ['d4 Nf6 Bf4', 'A45', 'London System'],
  ['d4 d5 Bf4', 'D00', 'London System'],
  ['d4 Nf6 Bg5', 'A45', 'Trompowsky Attack'],
  ['d4 d5 Nc3', 'D00', 'Richter-Veresov Attack'],
  ['d4 d5 e4', 'D00', 'Blackmar-Diemer Gambit'],

  // --- Indian defences ---------------------------------------------------
  ['d4 Nf6 c4', 'A50', 'Indian Defence'],
  ['d4 Nf6 c4 e6', 'E00', 'Indian Defence'],
  ['d4 Nf6 c4 e6 Nc3 Bb4', 'E20', 'Nimzo-Indian Defence'],
  ['d4 Nf6 c4 e6 Nf3 b6', 'E12', "Queen's Indian Defence"],
  ['d4 Nf6 c4 e6 g3', 'E00', 'Catalan Opening'],
  ['d4 Nf6 c4 e6 Nc3 d5', 'D35', "Queen's Gambit Declined"],
  ['d4 Nf6 c4 g6', 'A48', 'Indian Defence'],
  ['d4 Nf6 c4 g6 Nc3 Bg7 e4 d6', "E70", "King's Indian Defence"],
  ['d4 Nf6 c4 g6 Nc3 Bg7', 'E60', "King's Indian Defence"],
  ['d4 Nf6 c4 g6 Nc3 d5', 'D80', 'Grünfeld Defence'],
  ['d4 Nf6 c4 c5', 'A56', 'Benoni Defence'],
  ['d4 Nf6 c4 c5 d5 b5', 'A57', 'Benko Gambit'],
  ['d4 Nf6 c4 e5', 'A56', 'Budapest Gambit'],
  ['d4 e6 c4 b6', 'A40', 'English Defence'],

  // --- Flank -------------------------------------------------------------
  ['c4 e5', 'A20', 'English: Reversed Sicilian'],
  ['c4 c5', 'A30', 'English: Symmetrical'],
  ['c4 Nf6', 'A15', 'English: Anglo-Indian'],
  ['c4 e6', 'A10', 'English Opening'],
  ['Nf3 d5 c4', 'A09', 'Réti Opening'],
  ['Nf3 Nf6 c4', 'A15', 'English: Anglo-Indian'],
  ['Nf3 d5 g3', 'A07', "King's Indian Attack"],
  ['e4 e6 d3', 'A07', "King's Indian Attack"],
]

export interface Opening {
  eco: string
  name: string
  /** How many plies of the game the name covers. */
  plies: number
}

const INDEX = new Map<string, Opening>()
for (const [moves, eco, name] of BOOK) {
  INDEX.set(moves, { eco, name, plies: moves.split(' ').length })
}

/** Longest opening name matching the start of `sanMoves`, or null. */
export function findOpening(sanMoves: string[]): Opening | null {
  const limit = Math.min(sanMoves.length, 16)
  for (let n = limit; n > 0; n--) {
    const hit = INDEX.get(sanMoves.slice(0, n).join(' '))
    if (hit) return hit
  }
  return null
}

/** How many nested openings a one-band move row may show at most. */
export const OPENINGS_PER_MOVE_MIN = 0
export const OPENINGS_PER_MOVE_MAX = 6

/**
 * Every opening name whose line is a prefix of `sanMoves`, from the most
 * general (shortest line) to the most specific. Names that repeat on longer
 * lines — e.g. "Ruy López: Morphy Defence" covering both the 5- and 6-ply
 * transpositions — are collapsed, keeping the first sighting.
 */
export function findOpenings(sanMoves: string[]): Opening[] {
  const limit = Math.min(sanMoves.length, 16)
  const found: Opening[] = []
  for (let n = 1; n <= limit; n++) {
    const hit = INDEX.get(sanMoves.slice(0, n).join(' '))
    if (hit && (found.length === 0 || found[found.length - 1].name !== hit.name)) {
      found.push(hit)
    }
  }
  return found
}
