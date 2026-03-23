import React, { useState, useEffect, createContext, useContext, useCallback } from 'react'

interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

interface ToastContextType {
  toast: (type: ToastMessage['type'], message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export const useToast = () => useContext(ToastContext)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const toast = useCallback((type: ToastMessage['type'], message: string, duration: number = 5000) => {
    const id = Math.random().toString(36).substring(7)
    setToasts(prev => [...prev, { id, type, message, duration }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const COLORS = {
  success: { bg: '#065f46', border: '#10b981' },
  error: { bg: '#7f1d1d', border: '#ef4444' },
  warning: { bg: '#78350f', border: '#f59e0b' },
  info: { bg: '#1e3a5f', border: '#3b82f6' },
}

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), toast.duration || 5000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  const colors = COLORS[toast.type]

  return (
    <div
      style={{
        background: colors.bg,
        borderLeft: `4px solid ${colors.border}`,
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        maxWidth: '400px',
        fontSize: '14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        animation: 'slideIn 0.2s ease-out',
      }}
      onClick={() => onRemove(toast.id)}
    >
      {toast.message}
    </div>
  )
}
