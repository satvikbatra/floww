import React, { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          maxWidth: '500px',
          margin: '0 auto',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>!</div>
          <h2 style={{ marginBottom: '8px' }}>Something went wrong</h2>
          <p style={{ opacity: 0.6, marginBottom: '16px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            className="btn btn-primary"
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
