import React, { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import styles from './Toast.module.css'

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
      <div className={styles.container}>
        <AnimatePresence>
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

const ICONS: Record<ToastMessage['type'], React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
}

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), toast.duration || 5000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`${styles.toast} ${styles[toast.type]}`}
      onClick={() => onRemove(toast.id)}
    >
      <span className={styles.icon}>{ICONS[toast.type]}</span>
      <span className={styles.message}>{toast.message}</span>
      <button
        className={styles.close}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(toast.id)
        }}
      >
        <X size={14} />
      </button>
    </motion.div>
  )
}
