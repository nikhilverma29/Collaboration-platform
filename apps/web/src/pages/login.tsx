import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { ThemeSelector } from '@/components/theme-selector'
import type { AuthUser, WorkspaceMembership, ApiSuccess } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'login' | 'register'

interface FormState {
  displayName: string
  email: string
  password: string
}

interface FieldError {
  displayName?: string
  email?: string
  password?: string
  global?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validate(mode: Mode, form: FormState): FieldError {
  const errors: FieldError = {}

  if (mode === 'register' && !form.displayName.trim()) {
    errors.displayName = 'Name is required'
  }

  if (!form.email.trim()) {
    errors.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Enter a valid email address'
  }

  if (!form.password) {
    errors.password = 'Password is required'
  } else if (mode === 'register' && form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters'
  }

  return errors
}

// ---------------------------------------------------------------------------
// FloatingInput — labelled input with error state
// ---------------------------------------------------------------------------

interface FloatingInputProps {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  error?: string
  autoComplete?: string
  placeholder?: string
  showToggle?: boolean
  disabled?: boolean
}

function FloatingInput({
  id,
  label,
  type: initialType,
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
  showToggle = false,
  disabled = false,
}: FloatingInputProps) {
  const [visible, setVisible] = useState(false)
  const type = showToggle ? (visible ? 'text' : 'password') : initialType

  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`form-input${error ? ' error' : ''}`}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          style={showToggle ? { paddingRight: '2.5rem' } : undefined}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: '0.625rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.25rem',
              borderRadius: '0.25rem',
              transition: 'color var(--duration-fast) var(--ease-standard)',
            }}
            tabIndex={-1}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {error && (
        <span className="form-error">
          <AlertCircle size={11} />
          {error}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LoginPage
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser, setMemberships } = useAuthStore()

  const [mode, setMode] = useState<Mode>('login')
  const [form, setForm] = useState<FormState>({ displayName: '', email: '', password: '' })
  const [errors, setErrors] = useState<FieldError>({})
  const [loading, setLoading] = useState(false)

  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (v: string) => {
        setForm((f) => ({ ...f, [key]: v }))
        // Clear field error on change
        if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
      },
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setErrors({})
    setForm({ displayName: '', email: '', password: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const fieldErrors = validate(mode, form)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }

    setLoading(true)
    setErrors({})

    try {
      if (mode === 'login') {
        const res = await api.post<ApiSuccess<AuthUser>>('/auth/login', {
          email: form.email,
          password: form.password,
        })
        setUser({ ...res.data.data, avatarUrl: res.data.data.avatarUrl ?? null })
      } else {
        const res = await api.post<ApiSuccess<AuthUser>>('/auth/register', {
          displayName: form.displayName,
          email: form.email,
          password: form.password,
        })
        setUser({ ...res.data.data, avatarUrl: res.data.data.avatarUrl ?? null })
      }

      // Load workspace memberships before navigating
      try {
        const wsRes = await api.get<ApiSuccess<WorkspaceMembership[]>>('/workspaces')
        setMemberships(wsRes.data.data)
      } catch {
        // Non-fatal — workspace select page will retry
      }

      navigate('/workspace-select', { replace: true })
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ??
        err?.response?.data?.error ??
        (mode === 'login'
          ? 'Invalid email or password'
          : 'Registration failed. Please try again.')
      setErrors({ global: typeof msg === 'string' ? msg : 'Something went wrong' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle background glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '40rem',
          height: '30rem',
          background: 'radial-gradient(ellipse at center, var(--accent-ghost) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Auth card */}
      <div
        className="animate-scale-in"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '22rem',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-card)',
          borderRadius: '0.875rem',
          padding: '2rem',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '0.625rem',
              background: 'var(--accent-brand)',
              color: 'var(--accent-foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              letterSpacing: '-0.03em',
              margin: '0 auto 0.875rem',
            }}
          >
            S
          </div>
          <h1
            style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.015em',
            }}
          >
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {mode === 'login'
              ? 'Sign in to your Syncra workspace'
              : 'Start collaborating with your team'}
          </p>
        </div>

        {/* Mode tabs */}
        <div
          style={{
            display: 'flex',
            background: 'var(--surface-hover)',
            borderRadius: '0.5rem',
            padding: '0.1875rem',
            marginBottom: '1.25rem',
          }}
        >
          {(['login', 'register'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                flex: 1,
                padding: '0.375rem 0',
                borderRadius: '0.3125rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                transition: 'all var(--duration-fast) var(--ease-standard)',
                background: mode === m ? 'var(--surface-card)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer',
                border: 'none',
              }}
            >
              {m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {/* Name field — register only */}
            {mode === 'register' && (
              <FloatingInput
                id="displayName"
                label="Full name"
                type="text"
                autoComplete="name"
                placeholder="Alex Johnson"
                disabled={loading}
                error={errors.displayName}
                {...field('displayName')}
              />
            )}

            <FloatingInput
              id="email"
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              disabled={loading}
              error={errors.email}
              {...field('email')}
            />

            <FloatingInput
              id="password"
              label="Password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
              showToggle
              disabled={loading}
              error={errors.password}
              {...field('password')}
            />
          </div>

          {/* Global error */}
          {errors.global && (
            <div
              style={{
                marginTop: '0.875rem',
                padding: '0.625rem 0.75rem',
                borderRadius: '0.4375rem',
                background: 'var(--error-subtle)',
                border: '1px solid var(--error)',
                fontSize: '0.8125rem',
                color: 'var(--error)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.4375rem',
              }}
            >
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '0.0625rem' }} />
              {errors.global}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
            style={{ marginTop: '1.25rem' }}
          >
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
                <ArrowRight size={14} strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            textAlign: 'center',
            marginTop: '1.25rem',
          }}
        >
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            style={{
              color: 'var(--accent-brand)',
              fontWeight: 500,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              fontSize: 'inherit',
            }}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>

      {/* Theme selector — below card, centered */}
      <div style={{ marginTop: '1.5rem', zIndex: 1, position: 'relative' }}>
        <ThemeSelector />
      </div>
    </div>
  )
}
