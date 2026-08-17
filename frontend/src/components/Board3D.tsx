/**
 * The board as an actual scene: real geometry, real lights, a camera you can
 * fly around it.
 *
 * The flat board in Board.tsx stays the default. This one takes over when the
 * 3D piece style is chosen, and keeps the same contract — it is handed a
 * position and a set of legal destinations, and it reports moves back.
 *
 * three.js objects live in refs rather than in React state: React decides
 * *what* is on the board, and the effects below reconcile the scene to it.
 * Rebuilding meshes every render would drop frames and lose the camera.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Chess, Square } from 'chess.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { PieceRole } from '../chess/game'
import { PIECE_HEIGHT, pieceGeometries } from '../three/pieces'
import type { Arrow, PieceStyle } from './Board'
import './Board3D.css'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

/** Board coordinates: the centre of a1 is (-3.5, 0, 3.5), a8 is (-3.5, 0, -3.5). */
function squareToWorld(square: Square): THREE.Vector3 {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number])
  const rank = RANKS.indexOf(square[1] as (typeof RANKS)[number])
  return new THREE.Vector3(file - 3.5, 0, 3.5 - rank)
}

/** The 3D family of piece styles, each its own material recipe. */
export type Board3DVariant = Extract<PieceStyle, '3d' | '3d-marble'>

type Variant = Board3DVariant

/** Wood palette fallbacks, used when the CSS variables are unreadable. */
const COLORS = {
  lightWood: 0xf0e2c4,
  darkWood: 0x6d3a1e,
  lightSquare: 0xc3ab7f,
  darkSquare: 0x6f5535,
  frame: 0x3f2a18,
}

/** Read one of the theme's board-palette CSS variables as a hex colour. */
function cssHex(styles: CSSStyleDeclaration, name: string, fallback: number): number {
  const match = styles.getPropertyValue(name).trim().match(/^#([0-9a-f]{6})$/i)
  return match ? parseInt(match[1], 16) : fallback
}

/** The two piece materials for a 3D variant. */
function buildPieceMaterials(variant: Variant, styles: CSSStyleDeclaration): { w: THREE.Material; b: THREE.Material } {
  const white = new THREE.MeshPhysicalMaterial()
  const black = new THREE.MeshPhysicalMaterial()
  switch (variant) {
    case '3d':
      // Turned wood: the palette picks the grain colours, both themes included.
      white.color.setHex(cssHex(styles, '--board3d-piece-w', COLORS.lightWood))
      white.roughness = 0.32
      white.clearcoat = 0.7
      white.clearcoatRoughness = 0.2
      black.color.setHex(cssHex(styles, '--board3d-piece-b', COLORS.darkWood))
      black.roughness = 0.34
      black.clearcoat = 0.7
      black.clearcoatRoughness = 0.22
      break
    case '3d-marble':
      white.color.setHex(0xf5f2ea)
      white.roughness = 0.16
      white.metalness = 0.02
      white.clearcoat = 0.95
      white.clearcoatRoughness = 0.06
      black.color.setHex(0x45494f)
      black.roughness = 0.2
      black.metalness = 0.06
      black.clearcoat = 0.9
      black.clearcoatRoughness = 0.1
      break
  }
  return { w: white, b: black }
}

export function Board3D({
  chess,
  orientation,
  movable,
  dests,
  lastMove,
  checkSquare,
  arrows = [],
  onMove,
  freeView,
  onFreeViewChange,
  onSelectChange,
  variant = '3d',
}: {
  chess: Chess
  orientation: 'w' | 'b'
  movable: Array<'w' | 'b'>
  dests: Map<Square, Square[]>
  lastMove: { from: Square; to: Square } | null
  checkSquare: Square | null
  arrows?: Arrow[]
  onMove: (from: Square, to: Square) => void
  /** Unlocked means the camera can turn, pan, and zoom; locked keeps the board fixed. */
  freeView: boolean
  onFreeViewChange: (next: boolean) => void
  /** Fires whenever the selected square changes, including on deselect. */
  onSelectChange?: (square: Square | null) => void
  /** Which piece material recipe the 3D board uses. */
  variant?: Variant
}) {
  const mount = useRef<HTMLDivElement>(null)
  const scene = useRef<THREE.Scene>(null)
  const camera = useRef<THREE.PerspectiveCamera>(null)
  const controls = useRef<OrbitControls>(null)
  const renderer = useRef<THREE.WebGLRenderer>(null)
  const tiles = useRef<THREE.Mesh[]>([])
  const frameRef = useRef<THREE.Mesh>(null)
  const pieceGroup = useRef<THREE.Group>(null)
  const sheet = useRef<{ canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture } | null>(null)
  const dragged = useRef<{ from: Square; mesh: THREE.Object3D; lift: number } | null>(null)

  const [selected, setSelected] = useState<Square | null>(null)
  const [hover, setHover] = useState<Square | null>(null)
  /** Bumped when the theme changes so the annotation sheet repaints its CSS colours. */
  const [themeTick, setThemeTick] = useState(0)
  const fen = chess.fen()

  // Publish the selection so the page can act on it — the engine restricts its
  // move list to the chosen piece.
  useEffect(() => {
    onSelectChange?.(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // ------------------------------------------------------------ the scene
  useEffect(() => {
    const element = mount.current
    if (!element) return

    const localScene = new THREE.Scene()
    localScene.background = null
    const localCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    const localRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    localRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    localRenderer.shadowMap.enabled = true
    localRenderer.shadowMap.type = THREE.PCFSoftShadowMap
    localRenderer.toneMapping = THREE.ACESFilmicToneMapping
    localRenderer.toneMappingExposure = 1.15
    element.appendChild(localRenderer.domElement)

    // Key light casts the shadows; the hemisphere fills the undersides so the
    // dark pieces don't turn into silhouettes.
    const key = new THREE.DirectionalLight(0xfff2dd, 2.6)
    key.position.set(-4.5, 8, 4)
    key.castShadow = true
    // Shadows are deliberately faint and soft: a low shadow intensity reads
    // as transparency, and the smaller map blurs the contact edges instead of
    // drawing crisp little silhouettes. No normalBias: at this map size it
    // lifts the shadows off the piece bases and the board looks broken.
    key.shadow.intensity = 0.35
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -7
    key.shadow.camera.right = 7
    key.shadow.camera.top = 7
    key.shadow.camera.bottom = -7
    key.shadow.bias = -0.0009
    localScene.add(key)
    localScene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a1d10, 0.85))
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.5)
    rim.position.set(5, 3, -6)
    localScene.add(rim)

    // The table the board sits on, and the slim frame around the squares.
    // Its top sits just below the tile surface so the two never share a seam.
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(8.3, 0.32, 8.3),
      new THREE.MeshPhysicalMaterial({ color: COLORS.frame, roughness: 0.42, clearcoat: 0.35 }),
    )
    frame.position.y = -0.18
    frame.receiveShadow = true
    localScene.add(frame)
    frameRef.current = frame

    const tileGeometry = new THREE.BoxGeometry(1, 0.04, 1)
    const localTiles: THREE.Mesh[] = []
    for (const file of FILES) {
      for (const rank of RANKS) {
        const square = `${file}${rank}` as Square
        const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 1
        const tile = new THREE.Mesh(
          tileGeometry,
          new THREE.MeshPhysicalMaterial({
            color: isLight ? COLORS.lightSquare : COLORS.darkSquare,
            roughness: 0.55,
            clearcoat: 0.25,
          }),
        )
        tile.position.copy(squareToWorld(square))
        tile.position.y = -0.02
        tile.receiveShadow = true
        tile.userData = { square, light: isLight }
        localScene.add(tile)
        localTiles.push(tile)
      }
    }

    const pieces = new THREE.Group()
    localScene.add(pieces)

    // All annotations — highlights, move dots, arrows — are painted on one
    // transparent canvas plane lying flat on the squares, in the exact colours
    // of the 2D board. The sheet turns with the board, so it reads like a flat
    // board held in space rather than things floating in it.
    const sheetCanvas = document.createElement('canvas')
    sheetCanvas.width = 2048
    sheetCanvas.height = 2048
    const sheetContext = sheetCanvas.getContext('2d')
    if (!sheetContext) throw new Error('2D canvas unavailable')
    const sheetTexture = new THREE.CanvasTexture(sheetCanvas)
    sheetTexture.flipY = false
    sheetTexture.colorSpace = THREE.SRGBColorSpace
    const sheetMaterial = new THREE.MeshBasicMaterial({
      map: sheetTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    const sheetGeometry = new THREE.PlaneGeometry(8, 8)
    const sheetMesh = new THREE.Mesh(sheetGeometry, sheetMaterial)
    sheetMesh.rotation.x = -Math.PI / 2
    sheetMesh.position.y = 0.012
    sheetMesh.renderOrder = 1
    localScene.add(sheetMesh)

    // The sheet's colours come from the theme's CSS variables, so a theme
    // change has to repaint it. The theme class lives on the .app ancestor.
    const themeRoot = element.closest('.app') ?? document.documentElement
    const themeObserver = new MutationObserver(() => setThemeTick((tick) => tick + 1))
    themeObserver.observe(themeRoot, { attributes: true, attributeFilter: ['class'] })

    const localControls = new OrbitControls(localCamera, localRenderer.domElement)
    localControls.enableDamping = true
    localControls.dampingFactor = 0.09
    localControls.minDistance = 4
    localControls.maxDistance = 26
    // Just short of the horizon and just short of straight down: below the
    // board there is nothing to see, and exactly overhead the orbit gimbals.
    localControls.minPolarAngle = 0.08
    localControls.maxPolarAngle = Math.PI / 2 - 0.04
    localControls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    localCamera.position.set(0, 8.2, orientation === 'w' ? 8.6 : -8.6)
    localControls.target.set(0, 0.2, 0)
    localControls.update()

    scene.current = localScene
    camera.current = localCamera
    controls.current = localControls
    renderer.current = localRenderer
    tiles.current = localTiles
    pieceGroup.current = pieces
    sheet.current = { canvas: sheetCanvas, context: sheetContext, texture: sheetTexture }

    const resize = () => {
      const { clientWidth, clientHeight } = element
      if (!clientWidth || !clientHeight) return
      localCamera.aspect = clientWidth / clientHeight
      localCamera.updateProjectionMatrix()
      localRenderer.setSize(clientWidth, clientHeight, false)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)

    let frameId = 0
    const tick = () => {
      frameId = requestAnimationFrame(tick)
      localControls.update()
      localRenderer.render(localScene, localCamera)
    }
    tick()

    // The first render computed styles before the element existed; bump the
    // tick once the scene is real so palette colours and materials re-resolve.
    setThemeTick((tick) => tick + 1)

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      themeObserver.disconnect()
      localControls.dispose()
      localRenderer.dispose()
      tileGeometry.dispose()
      sheetGeometry.dispose()
      sheetMaterial.dispose()
      sheetTexture.dispose()
      localScene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const material = object.material
          if (Array.isArray(material)) material.forEach((m) => m.dispose())
          else material.dispose()
        }
      })
      element.removeChild(localRenderer.domElement)
    }
    // Built once. Orientation only seeds the opening camera; moving it later
    // is the player's business, not a re-render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The camera stands still unless the player unlocked it. Dragging a piece
  // and orbiting are both left-drag, so a locked board keeps dragging honest.
  useEffect(() => {
    if (controls.current) controls.current.enabled = freeView
  }, [freeView])

  // Built once and shared by every mesh: a position change re-places pieces,
  // it does not re-cut them. The materials follow the piece-style variant and
  // the board palette, so both the style buttons and the palette classes on
  // the .app root rebuild them.
  const geometries = useMemo(() => pieceGeometries(), [])
  const materials = useMemo(
    () =>
      buildPieceMaterials(
        variant,
        mount.current ? getComputedStyle(mount.current) : getComputedStyle(document.documentElement),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant, themeTick],
  )

  // The board palette also recolours the tiles and the frame; both are plain
  // meshes, so the theme observer's tick is all it takes to reapply the vars.
  useEffect(() => {
    const styles = getComputedStyle(mount.current as HTMLElement)
    for (const tile of tiles.current) {
      const material = tile.material as THREE.MeshPhysicalMaterial
      material.color.setHex(
        tile.userData.light
          ? cssHex(styles, '--board3d-tile-light', COLORS.lightSquare)
          : cssHex(styles, '--board3d-tile-dark', COLORS.darkSquare),
      )
    }
    if (frameRef.current) {
      const material = frameRef.current.material as THREE.MeshPhysicalMaterial
      material.color.setHex(cssHex(styles, '--board3d-frame', COLORS.frame))
    }
  }, [themeTick])

  useEffect(
    () => () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose())
      Object.values(materials).forEach((material) => material.dispose())
    },
    [geometries, materials],
  )

  // ----------------------------------------------------------- the pieces
  useEffect(() => {
    const group = pieceGroup.current
    if (!group) return

    group.clear()
    for (const row of chess.board()) {
      for (const piece of row) {
        if (!piece) continue
        const role = piece.type as PieceRole
        const mesh = new THREE.Mesh(geometries[role], materials[piece.color])
        mesh.position.copy(squareToWorld(piece.square))
        // Knights look at their opponent, the way they are set up on a board.
        // The geometry looks down +x; a rotation of ±90° turns it up the board.
        if (role === 'n') mesh.rotation.y = piece.color === 'w' ? Math.PI / 2 : -Math.PI / 2
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.userData = { square: piece.square }
        group.add(mesh)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, geometries, materials])

  // ---------------------------------------- annotations: one flat sheet
  // Everything the 2D board paints in HTML is painted here on the same canvas,
  // using the same CSS colours: square tints, the check glow, the white hover
  // ring, move dots and capture rings, and engine arrows with their heads. The
  // sheet lies flat on the squares, so it reads like a flat board held in space.
  useEffect(() => {
    const sheetRef = sheet.current
    if (!sheetRef) return
    const { canvas, context, texture } = sheetRef
    const size = canvas.width
    const unit = size / 8
    const ctx = context

    ctx.clearRect(0, 0, size, size)

    // The theme's CSS variables are inherited here, so arrows and dots match
    // the flat board exactly, including after a theme switch.
    const resolveColor = (value: string): string => {
      let resolved = value
      if (resolved.startsWith('var(')) {
        resolved = getComputedStyle(mount.current as HTMLElement)
          .getPropertyValue(resolved.slice(4, -1))
          .trim()
      }
      const spaced = resolved.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+)%?)?\s*\)$/)
      if (spaced) {
        const [, r, g, b, a] = spaced
        return `rgba(${r}, ${g}, ${b}, ${a === undefined ? 1 : parseFloat(a) / 100})`
      }
      return resolved
    }

    const squareRect = (square: Square): { x: number; y: number; w: number } => {
      const file = FILES.indexOf(square[0] as (typeof FILES)[number])
      const rank = RANKS.indexOf(square[1] as (typeof RANKS)[number])
      return { x: file * unit, y: rank * unit, w: unit }
    }
    const center = (rect: { x: number; y: number; w: number }) => ({
      x: rect.x + unit / 2,
      y: rect.y + unit / 2,
    })

    if (lastMove) {
      for (const square of [lastMove.from, lastMove.to]) {
        const rect = squareRect(square)
        ctx.fillStyle = resolveColor('var(--lastmove)')
        ctx.fillRect(rect.x, rect.y, rect.w, rect.w)
      }
    }
    if (checkSquare) {
      const rect = squareRect(checkSquare)
      const c = center(rect)
      const gradient = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rect.w / 2)
      gradient.addColorStop(0, 'rgba(255, 0, 0, 1)')
      gradient.addColorStop(0.25, 'rgba(231, 0, 0, 1)')
      gradient.addColorStop(0.89, 'rgba(169, 0, 0, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(rect.x, rect.y, rect.w, rect.w)
    }
    if (selected) {
      const rect = squareRect(selected)
      ctx.fillStyle = resolveColor('var(--selected)')
      ctx.fillRect(rect.x, rect.y, rect.w, rect.w)
    }
    if (hover) {
      const rect = squareRect(hover)
      const ring = 0.0035 * size
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
      ctx.lineWidth = ring
      ctx.strokeRect(rect.x + ring / 2, rect.y + ring / 2, rect.w - ring, rect.w - ring)
    }

    const destColor = resolveColor('var(--dest-dot)')
    const destSquares = selected ? (dests.get(selected) ?? []) : []
    for (const square of destSquares) {
      const rect = squareRect(square)
      const c = center(rect)
      const occupied = !!chess.get(square)
      ctx.beginPath()
      ctx.arc(c.x, c.y, occupied ? unit / 2 : 0.13 * unit, 0, Math.PI * 2)
      if (occupied) {
        ctx.strokeStyle = destColor
        ctx.lineWidth = 0.048 * unit
        ctx.stroke()
      } else {
        ctx.fillStyle = destColor
        ctx.fill()
      }
    }

    for (const arrow of arrows) {
      const a = center(squareRect(arrow.from))
      const b = center(squareRect(arrow.to))
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy)
      if (length < 0.01 * unit) continue
      const color = resolveColor(arrow.color ?? 'var(--arrow)')
      const strokeWidth = 0.15 * unit
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      // The 2D board's arrowhead: a triangle one marker-width long, its tip at
      // the destination centre, sitting on the stroke's far half.
      const ux = dx / length
      const uy = dy / length
      const backX = b.x - 0.39 * unit * ux
      const backY = b.y - 0.39 * unit * uy
      const px = -uy
      const py = ux
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(backX + px * 0.27 * unit, backY + py * 0.27 * unit)
      ctx.lineTo(backX - px * 0.27 * unit, backY - py * 0.27 * unit)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
    }

    texture.needsUpdate = true
  }, [selected, hover, dests, lastMove, checkSquare, arrows, chess, fen, themeTick])

  // ------------------------------------------------------------- pointing
  const squareAtPointer = useCallback((event: React.PointerEvent): Square | null => {
    const element = mount.current
    const cam = camera.current
    if (!element || !cam) return null
    const rect = element.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, cam)
    // Pieces are invisible to the mouse: picking is answered by the board
    // squares alone, so a piece's outline can never grab a click meant for
    // the square behind or beside it.
    const hits = raycaster.intersectObjects(tiles.current, false)
    return (hits[0]?.object.userData.square as Square | undefined) ?? null
  }, [])

  const canMoveFrom = (square: Square): boolean => {
    const piece = chess.get(square)
    return !!piece && movable.includes(piece.color) && (dests.get(square)?.length ?? 0) > 0
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    const square = squareAtPointer(event)
    if (!square) return

    if (selected && square !== selected && dests.get(selected)?.includes(square)) {
      onMove(selected, square)
      setSelected(null)
      return
    }

    if (!canMoveFrom(square)) {
      setSelected(null)
      return
    }

    setSelected(square)
    const mesh = pieceGroup.current?.children.find((child) => child.userData.square === square)
    if (mesh) {
      // Dragging a piece and orbiting the camera are both left-drag, so the
      // camera stands down for as long as a piece is in hand.
      if (controls.current) controls.current.enabled = false
      const role = chess.get(square)?.type as PieceRole | undefined
      dragged.current = { from: square, mesh, lift: role ? PIECE_HEIGHT[role] * 0.12 + 0.08 : 0.15 }
      mesh.position.y = dragged.current.lift
      ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    }
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    const square = squareAtPointer(event)
    if (!dragged.current) {
      setHover(square && canMoveFrom(square) ? square : null)
      return
    }
    setHover(square)
    if (square) {
      const target = squareToWorld(square)
      dragged.current.mesh.position.set(target.x, dragged.current.lift, target.z)
    }
  }

  const endDrag = () => {
    const drag = dragged.current
    dragged.current = null
    if (controls.current) controls.current.enabled = freeView
    return drag
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    const drag = endDrag()
    if (!drag) return
    const target = squareAtPointer(event)
    // Whatever happens next, put the piece back down: a legal move replaces
    // the whole set from the new position, and an illegal one has to undo.
    const home = squareToWorld(drag.from)
    drag.mesh.position.set(home.x, 0, home.z)
    setHover(null)
    if (target && target !== drag.from && dests.get(drag.from)?.includes(target)) {
      onMove(drag.from, target)
      setSelected(null)
    }
  }

  const resetView = () => {
    const cam = camera.current
    const orbit = controls.current
    if (!cam || !orbit) return
    cam.position.set(0, 8.2, orientation === 'w' ? 8.6 : -8.6)
    orbit.target.set(0, 0.2, 0)
    orbit.update()
  }

  return (
    <div className="board3d">
      <div
        className="board3d-canvas"
        ref={mount}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          endDrag()
          setHover(null)
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      <button
        className={`board3d-toggle${freeView ? ' active' : ''}`}
        onClick={() => onFreeViewChange(!freeView)}
        title={
          freeView
            ? 'Camera unlocked — drag to turn, right-drag to pan, scroll to zoom'
            : 'Camera locked — drag only moves pieces; unlock to pan and zoom'
        }
      >
        {freeView ? '🔓' : '🔒'} Pan/zoom
      </button>
      <button className="board3d-reset" onClick={resetView} title="Put the camera back behind your side">
        ⟳ View
      </button>
      <div className="board3d-hint">
        {freeView
          ? 'drag to turn · right-drag to pan · scroll to zoom'
          : 'camera fixed — drag pieces to move · unlock pan/zoom to turn'}
      </div>
    </div>
  )
}
