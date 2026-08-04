/**
 * Board sounds, synthesised with WebAudio.
 *
 * Short percussive blips rather than sample files: no assets to ship, and the
 * click/thud distinction is the only thing that has to read clearly.
 */

type SoundName = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'end' | 'lowtime'

let context: AudioContext | null = null
let enabled = true

function audio(): AudioContext | null {
  if (!enabled) return null
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
  }
  // Browsers suspend the context until a gesture; resume is a no-op afterwards.
  if (context.state === 'suspended') void context.resume()
  return context
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
}

export function isSoundEnabled(): boolean {
  return enabled
}

interface Blip {
  freq: number
  /** Seconds. */
  duration: number
  type?: OscillatorType
  gain?: number
  /** Frequency at the end of the blip, for a pitch sweep. */
  endFreq?: number
  /** Seconds to wait before playing, for two-part sounds. */
  delay?: number
}

function play(blips: Blip[]): void {
  const ctx = audio()
  if (!ctx) return
  const now = ctx.currentTime

  for (const blip of blips) {
    const start = now + (blip.delay ?? 0)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = blip.type ?? 'triangle'
    osc.frequency.setValueAtTime(blip.freq, start)
    if (blip.endFreq) osc.frequency.exponentialRampToValueAtTime(blip.endFreq, start + blip.duration)

    const peak = blip.gain ?? 0.18
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + blip.duration)

    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + blip.duration + 0.02)
  }
}

const SOUNDS: Record<SoundName, Blip[]> = {
  move: [{ freq: 320, endFreq: 190, duration: 0.075, type: 'triangle', gain: 0.16 }],
  capture: [
    { freq: 200, endFreq: 90, duration: 0.11, type: 'square', gain: 0.12 },
    { freq: 420, endFreq: 160, duration: 0.06, type: 'triangle', gain: 0.1 },
  ],
  castle: [
    { freq: 300, endFreq: 200, duration: 0.07, gain: 0.14 },
    { freq: 300, endFreq: 190, duration: 0.07, gain: 0.14, delay: 0.09 },
  ],
  check: [
    { freq: 660, duration: 0.09, type: 'sine', gain: 0.16 },
    { freq: 880, duration: 0.12, type: 'sine', gain: 0.14, delay: 0.08 },
  ],
  promote: [
    { freq: 520, duration: 0.08, type: 'sine', gain: 0.14 },
    { freq: 780, duration: 0.14, type: 'sine', gain: 0.13, delay: 0.07 },
  ],
  end: [
    { freq: 440, duration: 0.16, type: 'sine', gain: 0.16 },
    { freq: 330, duration: 0.16, type: 'sine', gain: 0.16, delay: 0.14 },
    { freq: 262, duration: 0.34, type: 'sine', gain: 0.17, delay: 0.28 },
  ],
  lowtime: [{ freq: 950, duration: 0.06, type: 'sine', gain: 0.12 }],
}

export function playSound(name: SoundName): void {
  play(SOUNDS[name])
}

/** Pick the sound a move deserves; check outranks capture, as on lichess. */
export function playMoveSound(ply: {
  san: string
  captured?: string
  promotion?: string
  check: boolean
  checkmate: boolean
}): void {
  if (ply.checkmate) playSound('end')
  else if (ply.check) playSound('check')
  else if (ply.san.startsWith('O-O')) playSound('castle')
  else if (ply.promotion) playSound('promote')
  else if (ply.captured) playSound('capture')
  else playSound('move')
}
