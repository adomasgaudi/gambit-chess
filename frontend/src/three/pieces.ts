/**
 * The piece geometry, built rather than loaded.
 *
 * A Staunton set is mostly turned wood, so most of a piece is a lathe: a 2D
 * profile revolved around the vertical axis. What isn't turned — the rook's
 * crenellations, the king's cross, the knight's head — is added as separate
 * geometry and merged, so each role still ends up as one buffer to draw.
 *
 * Units are squares: a square is 1.0 wide, and a king is about 1.5 tall.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { PieceRole } from '../chess/game'

/** A point on the turned profile: distance from the axis, and height. */
type ProfilePoint = [radius: number, height: number]

const LATHE_SEGMENTS = 48

/**
 * Revolve a profile. The profile is resampled through a Catmull-Rom curve
 * first, which is what turns a dozen hand-placed points into the continuous
 * curve of a real turned piece.
 */
function lathe(profile: ProfilePoint[], smoothness = 6): THREE.BufferGeometry {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)))
  const points = curve.getPoints(profile.length * smoothness)
  return new THREE.LatheGeometry(points, LATHE_SEGMENTS)
}

/**
 * Merge parts into one geometry. Lathes and boxes come back indexed while
 * extrusions do not, and mergeGeometries refuses a mixture — so everything is
 * flattened to non-indexed first.
 */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)))
  if (!merged) throw new Error('piece geometry could not be merged')
  return merged
}

/** The foot every piece shares, sized to the piece standing on it. */
function foot(radius: number): ProfilePoint[] {
  return [
    [0.0, 0.0],
    [radius, 0.0],
    [radius, 0.035],
    [radius * 0.93, 0.075],
    [radius * 0.7, 0.1],
    [radius * 0.62, 0.14],
  ]
}

function placedBox(
  width: number,
  height: number,
  depth: number,
  position: [number, number, number],
  rotationY = 0,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  if (rotationY) geometry.rotateY(rotationY)
  geometry.translate(...position)
  return geometry
}

function ringOf(count: number, radius: number, make: (angle: number) => THREE.BufferGeometry) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count
    const geometry = make(angle)
    geometry.translate(radius * Math.cos(angle), 0, radius * Math.sin(angle))
    return geometry
  })
}

// ------------------------------------------------------------------- roles

function pawn(): THREE.BufferGeometry {
  return lathe([
    ...foot(0.30),
    [0.115, 0.2],
    [0.09, 0.34],
    [0.085, 0.42],
    [0.13, 0.46],
    [0.125, 0.5],
    [0.075, 0.52],
    [0.145, 0.6],
    [0.13, 0.69],
    [0.0, 0.74],
  ])
}

function rook(): THREE.BufferGeometry {
  const body = lathe([
    ...foot(0.325),
    [0.2, 0.24],
    [0.19, 0.5],
    [0.205, 0.58],
    [0.26, 0.62],
    [0.255, 0.7],
    [0.235, 0.72],
    [0.235, 0.8],
    [0.0, 0.8],
  ])
  // Crenellations sit on the rim rather than being cut out of it: same
  // silhouette, none of the cost of a boolean.
  const merlons = ringOf(6, 0.2, (angle) =>
    new THREE.BoxGeometry(0.11, 0.12, 0.075).rotateY(-angle).translate(0, 0.86, 0),
  )
  return merge([body, ...merlons])
}

function bishop(): THREE.BufferGeometry {
  const body = lathe([
    ...foot(0.305),
    [0.145, 0.22],
    [0.105, 0.4],
    [0.095, 0.52],
    [0.15, 0.58],
    [0.145, 0.62],
    [0.09, 0.65],
    [0.135, 0.72],
    [0.155, 0.82],
    [0.13, 0.94],
    [0.06, 1.02],
    [0.055, 1.06],
    [0.0, 1.09],
  ])
  // The mitre's slit, as a thin wedge standing proud of the surface.
  const slit = placedBox(0.028, 0.17, 0.34, [0, 0.9, 0.02])
  return merge([body, slit])
}

function queen(): THREE.BufferGeometry {
  const body = lathe([
    ...foot(0.335),
    [0.175, 0.22],
    [0.13, 0.45],
    [0.115, 0.62],
    [0.15, 0.7],
    [0.145, 0.74],
    [0.1, 0.77],
    [0.185, 0.86],
    [0.175, 0.93],
    [0.135, 0.95],
    [0.0, 0.95],
  ])
  const points = ringOf(8, 0.16, () => new THREE.SphereGeometry(0.045, 12, 10).translate(0, 0.99, 0))
  const finial = new THREE.SphereGeometry(0.065, 16, 12).translate(0, 1.02, 0)
  return merge([body, ...points, finial])
}

function king(): THREE.BufferGeometry {
  const body = lathe([
    ...foot(0.34),
    [0.18, 0.22],
    [0.135, 0.48],
    [0.12, 0.66],
    [0.155, 0.74],
    [0.15, 0.78],
    [0.105, 0.81],
    [0.185, 0.9],
    [0.175, 0.98],
    [0.13, 1.0],
    [0.0, 1.0],
  ])
  const cross = [
    placedBox(0.06, 0.22, 0.06, [0, 1.11, 0]),
    placedBox(0.16, 0.06, 0.06, [0, 1.14, 0]),
  ]
  return merge([body, ...cross])
}

/**
 * The knight is the one piece that isn't turned. Its head is an extruded
 * side profile — the same way it is carved — mounted on a turned base.
 */
function knight(): THREE.BufferGeometry {
  const base = lathe([
    ...foot(0.305),
    [0.19, 0.2],
    [0.175, 0.3],
    [0.19, 0.34],
    [0.175, 0.38],
  ])

  const outline = new THREE.Shape()
  outline.moveTo(-0.17, 0.3)
  outline.lineTo(-0.19, 0.62)
  outline.bezierCurveTo(-0.2, 0.82, -0.16, 0.95, -0.05, 1.02) // the mane
  outline.lineTo(-0.07, 1.09)
  outline.lineTo(0.0, 1.04) // between the ears
  outline.lineTo(0.05, 1.1)
  outline.lineTo(0.08, 0.99)
  outline.bezierCurveTo(0.16, 0.96, 0.24, 0.9, 0.28, 0.82) // brow to nose
  outline.lineTo(0.31, 0.71)
  outline.lineTo(0.24, 0.67) // muzzle
  outline.bezierCurveTo(0.16, 0.66, 0.1, 0.6, 0.06, 0.52) // jaw
  outline.lineTo(0.17, 0.42)
  outline.lineTo(0.17, 0.3)
  outline.closePath()

  const head = new THREE.ExtrudeGeometry(outline, {
    depth: 0.26,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    bevelSegments: 4,
    curveSegments: 16,
  })
  // Extrusion runs along +z from the shape's plane; centre it and face the
  // horse down the +x axis, which is how the board orients it.
  head.translate(0, 0, -0.13)

  return merge([base, head])
}

const BUILDERS: Record<PieceRole, () => THREE.BufferGeometry> = {
  p: pawn,
  r: rook,
  n: knight,
  b: bishop,
  q: queen,
  k: king,
}

/** Built once and shared by every piece of that role on the board. */
export function pieceGeometries(): Record<PieceRole, THREE.BufferGeometry> {
  const built = {} as Record<PieceRole, THREE.BufferGeometry>
  for (const [role, build] of Object.entries(BUILDERS) as [PieceRole, () => THREE.BufferGeometry][]) {
    const geometry = build()
    geometry.computeVertexNormals()
    built[role] = geometry
  }
  return built
}

/** Roughly how tall each role stands, for the camera and for drag lifting. */
export const PIECE_HEIGHT: Record<PieceRole, number> = {
  p: 0.74,
  r: 0.92,
  n: 1.1,
  b: 1.09,
  q: 1.07,
  k: 1.22,
}
