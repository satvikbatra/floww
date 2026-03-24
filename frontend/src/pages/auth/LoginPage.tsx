import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Mail, Lock } from 'lucide-react'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await auth.login(email, password)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.subtitle}>Sign in to your account</p>

      {error && <div className={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail size={16} />}
          required
          autoComplete="email"
        />
        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock size={16} />}
          required
          autoComplete="current-password"
        />
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={loading}
        >
          Sign in
        </Button>
      </form>

      <hr className={styles.divider} />

      <p className={styles.footer}>
        Don't have an account?{' '}
        <Link to="/register" className={styles.footerLink}>
          Sign up
        </Link>
      </p>
    </div>
  )
}
