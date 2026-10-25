import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6 text-center shadow-lift">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <h1 className="text-[15px] font-medium text-ink">Something went wrong</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            The interface hit an unexpected error. Your generations are stored on the
            server and are safe.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-md border border-line bg-canvas p-3 text-left font-mono text-[10px] text-faint">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
