/**
 * The overflow menu for position tools — PGN and FEN, board flip, sound.
 *
 * These are things you reach for occasionally; keeping them out of the main
 * action row leaves New game / Takeback / Resign where the eye expects them.
 */

import { useEffect, useRef } from 'react'
import './ToolsMenu.css'

export interface ToolItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  /** Renders above the item as a group separator. */
  divider?: boolean
}

export function ToolsMenu({ items, onClose }: { items: ToolItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    // Capture phase, so the button that opened the menu can't immediately
    // re-open it after this closes.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="tools-menu" ref={ref}>
      {items.map((item) => (
        <div key={item.label} className={item.divider ? 'tools-group' : undefined}>
          <button
            className="tools-item"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
