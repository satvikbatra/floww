import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './AuthLayout.module.css'

export function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return null
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return (
    <div className={styles.layout}>
      <div className={styles.container}>
        <div className={styles.logo}>Floww</div>
        <div className={styles.card}>
          <Outlet />
        </div>
        <p className={styles.footer}>
          Floww — AI-powered documentation generator
        </p>
      </div>
    </div>
  )
}
