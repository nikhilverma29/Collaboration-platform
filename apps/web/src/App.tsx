import { RouterProvider } from 'react-router-dom'
import { router } from '@/routes/router'
import { useBootstrap } from '@/hooks/use-bootstrap'

/**
 * App
 *
 * The root component. Its only jobs are:
 * 1. Run the bootstrap hook (session check + theme application).
 * 2. Hand control to the router.
 *
 * All providers are in main.tsx (above this component), so this component
 * can safely use hooks from those providers (Zustand, React Query).
 */
export default function App() {
  // Runs once: applies persisted theme/accent, verifies session cookie,
  // sets isBootstrapping = false so route guards unblock.
  useBootstrap()

  return <RouterProvider router={router} />
}
