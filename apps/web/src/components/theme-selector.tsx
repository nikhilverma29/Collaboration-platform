import { Sun, Moon } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import type { Theme } from '@/stores/ui-store'

/**
 * Theme options — deliberately limited to Light and Dark.
 * System has been removed to keep Syncra's visual model explicit.
 * See: ui-store.ts → Theme type.
 */
const OPTIONS: { value: Theme; icon: React.ElementType; label: string }[] = [
  { value: 'light', icon: Sun,  label: 'Light' },
  { value: 'dark',  icon: Moon, label: 'Dark'  },
]

/**
 * ThemeSelector
 *
 * Two rendering modes:
 *  - default (no props)    : labelled pill group — used in account/preferences menus
 *  - compact               : icon-only toggle — used in compact contexts (auth screens, etc.)
 */
interface ThemeSelectorProps {
  /** When true, renders as 2 icon-only buttons without text labels */
  compact?: boolean
}

export function ThemeSelector({ compact = false }: ThemeSelectorProps) {
  const { theme, setTheme } = useUIStore()

  if (compact) {
    return (
      <div
        role="group"
        aria-label="Theme preference"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0,
          borderRadius: '0.375rem',
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          padding: '0.125rem',
        }}
      >
        {OPTIONS.map(({ value, icon: Icon, label }) => {
          const isActive = theme === value
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              title={label}
              aria-pressed={isActive}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.625rem',
                height: '1.625rem',
                borderRadius: '0.25rem',
                border: 'none',
                cursor: 'pointer',
                color: isActive ? 'var(--accent-brand)' : 'var(--text-tertiary)',
                background: isActive ? 'var(--accent-ghost)' : 'transparent',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <Icon size={13} strokeWidth={isActive ? 2 : 1.5} />
            </button>
          )
        })}
      </div>
    )
  }

  // Full labelled version — used in account/preference menus and auth screens
  return (
    <div
      role="group"
      aria-label="Theme preference"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        borderRadius: '0.5rem',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        padding: '0.1875rem',
      }}
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const isActive = theme === value
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            aria-pressed={isActive}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3125rem',
              padding: '0.3125rem 0.625rem',
              borderRadius: '0.3125rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent-brand)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-ghost)' : 'transparent',
              transition: 'background 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={13} strokeWidth={isActive ? 2 : 1.5} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
