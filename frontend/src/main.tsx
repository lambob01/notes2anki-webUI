import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2000,
    },
  },
})

const toastStyle: React.CSSProperties = {
  background: 'rgb(var(--panel))',
  color: 'rgb(var(--ink))',
  border: '1px solid rgb(var(--line))',
  borderRadius: '10px',
  padding: '10px 12px',
  fontSize: '13px',
  boxShadow: '0 18px 50px -24px rgb(0 0 0 / 0.85)',
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster
          position="bottom-right"
          gutter={10}
          toastOptions={{
            style: toastStyle,
            success: {
              iconTheme: {
                primary: 'rgb(var(--success))',
                secondary: 'rgb(var(--panel))',
              },
            },
            error: {
              iconTheme: {
                primary: 'rgb(var(--danger))',
                secondary: 'rgb(var(--panel))',
              },
            },
          }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
