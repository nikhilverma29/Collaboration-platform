import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * Theme — intentionally limited to explicit choices only.
 * 'system' has been removed: Syncra uses a tightly-controlled visual system
 * with deliberate Light/Dark parity. Delegating appearance to the OS
 * introduces a third state that complicates design validation.
 */
export type Theme = 'dark' | 'light'

// ---------------------------------------------------------------------------
// Rail Areas
// ---------------------------------------------------------------------------

export type RailArea = 'home' | 'tasks' | 'chat' | 'docs' | 'calendar' | 'ai'

const RAIL_LAST_VISITED_KEY = 'syncra_rail_last_visited'

function getInitialLastVisited(): Partial<Record<RailArea, string>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(RAIL_LAST_VISITED_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface UIState {
  /** Current colour scheme. Applied as a class on <html>. */
  theme: Theme

  /**
   * Accent colour identifier.
   * Applied as a data-accent attribute on <html> for CSS variable overrides.
   * Valid values correspond to ACCENT_COLORS[n].name in lib/constants.ts.
   */
  accentColor: string

  /** Whether the sidebar is collapsed (desktop). */
  sidebarCollapsed: boolean

  /** Whether the mobile drawer is open. */
  mobileDrawerOpen: boolean

  /** Last-visited full route (pathname + query) per rail area. */
  lastVisitedRoutes: Partial<Record<RailArea, string>>
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface UIActions {
  setTheme: (theme: Theme) => void
  /** Cycles: dark → light → system → dark */
  toggleTheme: () => void
  setAccentColor: (color: string) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (value: boolean) => void
  setMobileDrawerOpen: (value: boolean) => void
  setLastVisitedRoute: (area: RailArea, path: string) => void
  clearLastVisitedRoutes: () => void
}

type UIStore = UIState & UIActions

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Defaults
      theme: 'dark',
      accentColor: 'Yellow',
      sidebarCollapsed: false,
      mobileDrawerOpen: false,
      lastVisitedRoutes: getInitialLastVisited(),

      // Actions
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },

      toggleTheme: () =>
        set((s) => {
          const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
          applyTheme(next)
          return { theme: next }
        }),

      setAccentColor: (accentColor) => {
        applyAccent(accentColor)
        set({ accentColor })
      },

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),

      setMobileDrawerOpen: (value) => set({ mobileDrawerOpen: value }),

      setLastVisitedRoute: (area, path) =>
        set((s) => {
          const next = { ...s.lastVisitedRoutes, [area]: path }
          try {
            sessionStorage.setItem(RAIL_LAST_VISITED_KEY, JSON.stringify(next))
          } catch {}
          return { lastVisitedRoutes: next }
        }),

      clearLastVisitedRoutes: () => {
        try {
          sessionStorage.removeItem(RAIL_LAST_VISITED_KEY)
        } catch {}
        set({ lastVisitedRoutes: {} })
      },
    }),
    {
      name: STORAGE_KEYS.THEME,
      storage: createJSONStorage(() => localStorage),
      // Bump version to 3 — removes 'system' theme. Users who had 'system'
      // selected are migrated to 'dark' (the application default).
      version: 3,
      migrate: (persistedState: any, version: number) => {
        const validThemes: Theme[] = ['dark', 'light']
        if (version < 1) {
          // v0 had 'Indigo' as default accent
          return { ...persistedState, accentColor: 'Yellow' }
        }
        if (version < 2) {
          // v1 had only 'dark' | 'light' — preserve valid themes, default others to 'dark'
          const theme = persistedState?.theme
          return {
            ...persistedState,
            theme: validThemes.includes(theme) ? theme : 'dark',
          }
        }
        if (version < 3) {
          // v2 included 'system' — migrate to 'dark'
          const theme = persistedState?.theme
          return {
            ...persistedState,
            theme: validThemes.includes(theme) ? theme : 'dark',
          }
        }
        return {
          ...persistedState,
          lastVisitedRoutes: persistedState?.lastVisitedRoutes ?? {},
        } as UIState
      },
      // Persist visual preferences + last-visited routes
      partialize: (state) => ({
        theme: state.theme,
        accentColor: state.accentColor,
        sidebarCollapsed: state.sidebarCollapsed,
        lastVisitedRoutes: state.lastVisitedRoutes,
      }),
    }
  )
)

// ---------------------------------------------------------------------------
// DOM side-effects — apply theme/accent to <html> element
// Called both from actions (on change) and from the bootstrap hook (on mount).
// ---------------------------------------------------------------------------

/**
 * Applies a theme to the <html> element.
 * Only 'dark' and 'light' are valid user-facing choices.
 * Called from both actions (on change) and the bootstrap hook (on mount).
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme === 'dark' ? 'dark' : 'light')
}

export function applyAccent(color: string) {
  document.documentElement.setAttribute('data-accent', color.toLowerCase())
}
