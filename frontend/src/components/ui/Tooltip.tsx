import { type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import styles from './Tooltip.module.css'

export interface TooltipProps {
  content: string
  position?: 'top' | 'bottom'
  children: ReactNode
  className?: string
}

export function Tooltip({
  content,
  position = 'top',
  children,
  className,
}: TooltipProps) {
  return (
    <div className={cn(styles.wrapper, className)}>
      {children}
      <div className={cn(styles.tooltip, styles[position])}>{content}</div>
    </div>
  )
}
