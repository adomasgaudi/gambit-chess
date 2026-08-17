import type { Theme } from '../prefs'

export function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <div className="theme-picker" role="group" aria-label="Colour theme">
      <span className="theme-picker-label">Theme</span>
      <button
        className={theme === 'white' ? 'active' : ''}
        onClick={() => onChange('white')}
        aria-label="Use the white theme"
        aria-pressed={theme === 'white'}
      >
        White
      </button>
      <button
        className={theme === 'black' ? 'active' : ''}
        onClick={() => onChange('black')}
        aria-label="Use the black theme"
        aria-pressed={theme === 'black'}
      >
        Black
      </button>
    </div>
  )
}
