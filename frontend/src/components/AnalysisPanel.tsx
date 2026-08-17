/** Maia-only analysis controls and the five human-style evaluation cards. */

import { useState, type ReactNode } from 'react'
import type { MaiaDisplayMode } from '../engines/maia'
import './AnalysisPanel.css'

export function AnalysisPanel({
  evalOn,
  onToggleEval,
  children,
}: {
  evalOn: boolean
  onToggleEval: () => void
  children: ReactNode
}) {
  const [sectionOpen, setSectionOpen] = useState(true)

  return (
    <div className="analysis-panel">
      <div className="analysis-head">
        <label className="switch">
          <input type="checkbox" checked={evalOn} onChange={onToggleEval} />
          <span>Maia eval</span>
        </label>
        <button
          className="icon-btn analysis-collapse"
          onClick={() => setSectionOpen((value) => !value)}
          title={sectionOpen ? 'Collapse Maia evaluation' : 'Expand Maia evaluation'}
          aria-label={sectionOpen ? 'Collapse Maia evaluation' : 'Expand Maia evaluation'}
          aria-expanded={sectionOpen}
        >
          {sectionOpen ? '⌄' : '›'}
        </button>
      </div>
      {sectionOpen && evalOn && children}
    </div>
  )
}

export type { MaiaDisplayMode }
