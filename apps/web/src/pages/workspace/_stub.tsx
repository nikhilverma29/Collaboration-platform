import { type LucideIcon } from 'lucide-react'

interface StubPageProps {
  icon: LucideIcon
  title: string
  description: string
  accent?: string
}

export function StubPage({ icon: Icon, title, description, accent = 'var(--accent-brand)' }: StubPageProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: '1rem',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{
        width: '3.5rem',
        height: '3.5rem',
        borderRadius: '1rem',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <Icon size={22} strokeWidth={1.5} style={{ color: accent }} />
      </div>
      <div style={{ maxWidth: '22rem' }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '0.375rem',
          letterSpacing: '-0.01em',
        }}>{title}</h2>
        <p style={{
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>{description}</p>
      </div>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3125rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        fontSize: '0.6875rem',
        fontWeight: 500,
        color: 'var(--text-tertiary)',
        letterSpacing: '0.02em',
      }}>
        <span style={{ width: '0.4375rem', height: '0.4375rem', borderRadius: '50%', background: accent, display: 'inline-block' }} />
        Coming soon
      </div>
    </div>
  )
}
