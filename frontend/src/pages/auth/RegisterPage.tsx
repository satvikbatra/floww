import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Mail, Lock, User } from 'lucide-react'
import styles from './RegisterPage.module.css'

export function RegisterPage() {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await auth.register({ username, email, password })
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className={styles.title}>Create an account</h1>
      <p className={styles.subtitle}>Start generating documentation</p>

      {error && <div className={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Username"
          type="text"
          placeholder="Choose a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          leftIcon={<User size={16} />}
          required
          autoComplete="username"
        />
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
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock size={16} />}
          required
          autoComplete="new-password"
        />
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={loading}
        >
          Create account
        </Button>
      </form>

      <hr className={styles.divider} />

      <p className={styles.footer}>
        Already have an account?{' '}
        <Link to="/login" className={styles.footerLink}>
          Sign in
        </Link>
      </p>
    </div>
  )
}
