import { Chess, type Square } from 'chess.js'

/**
 * Render a UCI principal variation as SAN, starting from `fen`.
 * The first move carries a move number (`14...Nf6`) so a line read out of
 * context still says where it starts.
 */
export function pvToSan(fen: string, pv: string[], limit = 12): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  let first = true

  for (const uci of pv.slice(0, limit)) {
    const number = chess.moveNumber()
    const white = chess.turn() === 'w'
    let move
    try {
      move = chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.length > 4 ? uci[4] : undefined,
      })
    } catch {
      break
    }
    if (!move) break

    if (white) out.push(`${number}. ${move.san}`)
    else if (first) out.push(`${number}... ${move.san}`)
    else out.push(move.san)
    first = false
  }
  return out
}

/**
 * The same variation as bare SAN, with no move numbers — the form the opening
 * book is keyed on.
 */
export function pvToSanList(fen: string, pv: string[], limit = 16): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const uci of pv.slice(0, limit)) {
    let move
    try {
      move = chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.length > 4 ? uci[4] : undefined,
      })
    } catch {
      break
    }
    if (!move) break
    out.push(move.san)
  }
  return out
}

/** Just the SAN of a single move, for compact hints. */
export function uciToSan(fen: string, uci: string): string {
  const chess = new Chess(fen)
  try {
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? uci[4] : undefined,
    })
    return move?.san ?? uci
  } catch {
    return uci
  }
}
