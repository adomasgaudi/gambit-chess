import { useId, useState, type ReactNode } from 'react'
import './CollapsibleSection.css'

export function CollapsibleSection({
  title,
  summary,
  children,
  defaultOpen = true,
  className = '',
}: {
  title: ReactNode
  summary?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = `section-${useId().replaceAll(':', '')}`

  return (
    <section className={`collapsible-section${open ? ' open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="collapsible-heading"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="collapsible-chevron" aria-hidden="true">
          {open ? '⌄' : '›'}
        </span>
        <span className="collapsible-title">{title}</span>
        {summary !== undefined && <span className="collapsible-summary">{summary}</span>}
      </button>
      {open && (
        <div id={contentId} className="collapsible-content">
          {children}
        </div>
      )}
    </section>
  )
}
