import React, { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import styles from './ErrorBoundary.module.css'

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
        <div className={styles.container}>
          <div className={styles.iconWrapper}>
            <AlertTriangle size={28} />
          </div>
          <h2 className={styles.title}>Something went wrong</h2>
          <p className={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            className={styles.reloadButton}
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
