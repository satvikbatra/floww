import { forwardRef, type ReactNode, type HTMLAttributes } from 'react'
import { cn } from '../../utils/cn'
import styles from './Card.module.css'

const paddingMap = {
  none: undefined,
  sm: styles.paddingSm,
  md: styles.paddingMd,
  lg: styles.paddingLg,
} as const

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'interactive'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children: ReactNode
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          styles.card,
          variant !== 'default' && styles[variant],
          paddingMap[padding],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)

Card.displayName = 'Card'
