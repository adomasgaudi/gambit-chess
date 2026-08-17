import { useState } from 'react'
import { APP_VERSION, CHANGELOG } from '../changelog'
import './Changelog.css'

export function Changelog() {
  const [open, setOpen] = useState(false)

  return (
    <div className="changelog-anchor">
      <button
        className="changelog-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Open version updates"
      >
        ↗ updates · {APP_VERSION}
      </button>
      {open && (
        <section className="changelog-panel" aria-label="Version updates">
          <div className="changelog-head">
            <span>Version updates</span>
            <button
              className="changelog-close"
              onClick={() => setOpen(false)}
              aria-label="Close version updates"
            >
              ×
            </button>
          </div>
          {CHANGELOG.map((entry) => (
            <details key={entry.version} className="changelog-entry">
              <summary>
                <span>{entry.version}</span> {entry.title}
              </summary>
              <p>{entry.summary}</p>
              {entry.detail && (
                <details className="changelog-detail">
                  <summary>More detail</summary>
                  <p>{entry.detail}</p>
                </details>
              )}
            </details>
          ))}
        </section>
      )}
    </div>
  )
}
