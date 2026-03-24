import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { login as apiLogin, register as apiRegister, getCurrentUser, getProjects } from '../hooks/useApi'
import type { User } from '../types'

const GUEST_USER: User = {
  id: 'guest',
  email: 'guest@floww.local',
  username: 'Guest',
  fullName: 'Guest User',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { username: string; email: string; password: string; fullName?: string }) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      // Have a token — validate it
      getCurrentUser()
        .then((response) => {
          setUser(response.data.user ?? response.data)
        })
        .catch(() => {
          localStorage.removeItem('token')
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      // No token — check if auth is disabled by testing an API call
      getProjects()
        .then(() => {
          // API works without auth — auth is disabled, use guest user
          setUser(GUEST_USER)
        })
        .catch(() => {
          // API requires auth — user needs to log in
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password)
    const { accessToken, user: userData } = response.data
    localStorage.setItem('token', accessToken)
    setUser(userData)
  }, [])

  const register = useCallback(
    async (data: { username: string; email: string; password: string; fullName?: string }) => {
      const response = await apiRegister(data)
      const { accessToken, user: userData } = response.data
      localStorage.setItem('token', accessToken)
      setUser(userData)
    },
    []
  )

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
