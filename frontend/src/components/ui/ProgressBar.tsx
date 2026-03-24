import { cn } from '../../utils/cn'
import styles from './ProgressBar.module.css'

export interface ProgressBarProps {
  value: number
  label?: string
  variant?: 'default' | 'success' | 'warning'
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function ProgressBar({
  value,
  label,
  variant = 'default',
  showLabel = false,
  size = 'md',
  className,
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value))

  return (
    <div className={cn(styles.container, className)}>
      {(label || showLabel) && (
        <div className={styles.labelWrapper}>
          {label && <span className={styles.label}>{label}</span>}
          {showLabel && <span className={styles.percentage}>{Math.round(clampedValue)}%</span>}
        </div>
      )}
      <div className={cn(styles.track, styles[size])}>
        <div
          className={cn(styles.fill, styles[variant])}
          style={{ width: `${clampedValue}%` }}
          role="progressbar"
          aria-valuenow={clampedValue}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}
