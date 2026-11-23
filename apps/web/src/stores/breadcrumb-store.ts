import { create } from 'zustand'

/**
 * Lightweight store that individual pages push their active sub-entity label into.
 * The Topbar reads this to enrich the breadcrumb trail beyond the URL segment.
 *
 * Usage in a page:
 *   const { setLabel } = useBreadcrumbStore()
 *   useEffect(() => { setLabel('#main-work') }, [activeChannel])
 *   useEffect(() => () => setLabel(null), [])  // clear on unmount
 */
interface BreadcrumbState {
  subLabel: string | null
  setLabel: (label: string | null) => void
}

export const useBreadcrumbStore = create<BreadcrumbState>((set, get) => ({
  subLabel: null,
  setLabel: (label) => {
    if (get().subLabel !== label) {
      set({ subLabel: label })
    }
  },
}))
