import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Home,
  CheckSquare,
  MessageSquare,
  FileText,
  CalendarDays,
  Sparkles,
  Settings,
  ArrowRight,
  Clock,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Command palette data
// ---------------------------------------------------------------------------

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ElementType
  to?: string
  action?: () => void
  group: string
  keywords?: string[]
}

const NAV_ITEMS: CommandItem[] = [
  { id: 'home',     label: 'Go to Home',     icon: Home,          to: '/workspace/dashboard', group: 'Navigate', keywords: ['dashboard'] },
  { id: 'tasks',    label: 'Go to Tasks',    icon: CheckSquare,   to: '/workspace/tasks',     group: 'Navigate' },
  { id: 'chat',     label: 'Go to Chat',     icon: MessageSquare, to: '/workspace/chat',      group: 'Navigate' },
  { id: 'docs',     label: 'Go to Docs',     icon: FileText,      to: '/workspace/docs',      group: 'Navigate' },
  { id: 'calendar', label: 'Go to Calendar', icon: CalendarDays,  to: '/workspace/calendar',  group: 'Navigate' },
  { id: 'ai',       label: 'Go to AI',       icon: Sparkles,      to: '/workspace/ai',        group: 'Navigate', keywords: ['copilot', 'assistant'] },
  { id: 'settings', label: 'Open Settings',  icon: Settings,      to: '/workspace/settings',  group: 'Navigate' },
]

const RECENTS: CommandItem[] = [
  { id: 'r1', label: 'Homepage redesign brief', description: 'Task · 2m ago',  icon: CheckSquare,   to: '/workspace/tasks',   group: 'Recent' },
  { id: 'r2', label: '#engineering',            description: 'Channel · 14m ago', icon: MessageSquare, to: '/workspace/chat', group: 'Recent' },
  { id: 'r3', label: 'Q3 Roadmap.md',           description: 'Doc · 1h ago',   icon: FileText,      to: '/workspace/docs',    group: 'Recent' },
]

function matchItems(query: string, items: CommandItem[]): CommandItem[] {
  if (!query) return items
  const q = query.toLowerCase()
  return items.filter((item) =>
    item.label.toLowerCase().includes(q) ||
    item.description?.toLowerCase().includes(q) ||
    item.keywords?.some((k) => k.includes(q))
  )
}

// ---------------------------------------------------------------------------
// Command Palette
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery]       = useState('')
  const [cursor, setCursor]     = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setCursor(0)
    }
  }, [open])

  // Build visible items
  const navMatches    = matchItems(query, NAV_ITEMS)
  const recentMatches = query ? [] : RECENTS
  const allItems      = query ? navMatches : [...recentMatches, ...navMatches]

  const execute = useCallback((item: CommandItem) => {
    if (item.to) navigate(item.to)
    else item.action?.()
    onClose()
  }, [navigate, onClose])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, allItems.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
      if (e.key === 'Enter' && allItems[cursor]) execute(allItems[cursor])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, cursor, allItems, execute, onClose])

  // Scroll cursor into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  // Group items
  const groups = allItems.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  let globalIdx = 0

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'var(--surface-overlay)',
          zIndex: 200,
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '12vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(38rem, calc(100vw - 2rem))',
          zIndex: 201,
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-card)',
          borderRadius: '0.875rem',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          animation: 'slideInUp 0.18s var(--ease-spring) both',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <Search size={16} strokeWidth={1.75} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
            placeholder="Search or jump to anything…"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: '0.9375rem',
              color: 'var(--text-primary)',
            }}
            aria-label="Search"
          />
          <kbd style={{
            padding: '0.125rem 0.375rem',
            borderRadius: '0.25rem',
            background: 'var(--surface-hover)',
            border: '1px solid var(--border-zone)',
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            fontFamily: 'inherit',
          }}>ESC</kbd>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          style={{ maxHeight: '22rem', overflowY: 'auto', padding: '0.375rem' }}
          role="listbox"
        >
          {allItems.length === 0 && (
            <div style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: 'var(--text-tertiary)',
            }}>
              No results for "{query}"
            </div>
          )}

          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div style={{
                padding: '0.375rem 0.625rem 0.1875rem',
                fontSize: '0.625rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-disabled)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}>
                {group === 'Recent' && <Clock size={9} strokeWidth={2} />}
                {group}
              </div>

              {items.map((item) => {
                const idx = globalIdx++
                const isActive = idx === cursor
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    data-idx={idx}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => execute(item)}
                    onMouseEnter={() => setCursor(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.625rem',
                      width: '100%',
                      padding: '0.5rem 0.625rem',
                      borderRadius: '0.4375rem',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface-hover)' : 'transparent',
                      transition: 'background 0.1s',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '1.625rem',
                      height: '1.625rem',
                      borderRadius: '0.375rem',
                      background: isActive ? 'var(--surface-active)' : 'var(--surface-1)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'background 0.1s',
                    }}>
                      <Icon size={12} strokeWidth={1.75} style={{ color: isActive ? 'var(--accent-brand)' : 'var(--text-secondary)' }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 450, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.label}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', marginTop: '0.0625rem' }}>
                          {item.description}
                        </div>
                      )}
                    </div>

                    {isActive && (
                      <ArrowRight size={12} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.5rem 1rem',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.6875rem',
          color: 'var(--text-disabled)',
        }}>
          {[['↑↓', 'navigate'], ['↵', 'open'], ['esc', 'close']].map(([key, label]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <kbd style={{
                padding: '0.0625rem 0.3125rem',
                borderRadius: '0.25rem',
                background: 'var(--surface-hover)',
                border: '1px solid var(--border-zone)',
                fontSize: '0.625rem',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                fontFamily: 'inherit',
              }}>{key}</kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
