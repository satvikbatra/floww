import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'
import styles from './Badge.module.css'

export interface BadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
  dot?: boolean
  children: ReactNode
  className?: string
}

export function Badge({
  variant = 'default',
  size = 'sm',
  dot = false,
  children,
  className,
}: BadgeProps) {
  return (
    <span className={cn(styles.badge, styles[variant], styles[size], className)}>
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  )
}
