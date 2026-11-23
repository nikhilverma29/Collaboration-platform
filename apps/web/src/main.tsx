import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryProvider } from '@/providers/query-provider'
import App from './App'
import './index.css'

/**
 * Provider tree order (outermost → innermost):
 *
 * StrictMode          — catches double-invocation bugs in development
 * QueryProvider       — React Query client, available to all components
 * App                 — calls useBootstrap(), then renders RouterProvider
 *
 * Zustand stores are global singletons — no provider needed.
 * React Router's RouterProvider is inside App (not here) so the bootstrap
 * hook can run before routes are evaluated.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
)
