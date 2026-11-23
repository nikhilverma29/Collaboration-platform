import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Re-fetch when the tab regains focus — keeps data fresh for long sessions
      refetchOnWindowFocus: true,
      // Don't retry on 4xx errors — these are auth/validation problems, not transient
      retry: (failureCount, error: any) => {
        const status = error?.response?.status
        if (status && status >= 400 && status < 500) return false
        return failureCount < 2
      },
      // Data is considered fresh for 30 seconds
      staleTime: 30_000,
    },
    mutations: {
      // No global retry for mutations — they change state and retrying is unsafe
      retry: false,
    },
  },
})

interface QueryProviderProps {
  children: React.ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

// Export the queryClient so stores can imperatively invalidate queries on logout
export { queryClient }
