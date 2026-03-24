import { cn } from '../../utils/cn'
import styles from './Skeleton.module.css'

export interface SkeletonProps {
  variant?: 'text' | 'rectangular' | 'circular'
  width?: string | number
  height?: string | number
  lines?: number
  className?: string
}

function toStyleValue(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  lines = 1,
  className,
}: SkeletonProps) {
  if (variant === 'text') {
    return (
      <div className={className} style={{ width: toStyleValue(width) }}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(
              styles.skeleton,
              styles.textLine,
              i === lines - 1 && lines > 1 && styles.lastLine,
            )}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        styles.skeleton,
        variant === 'circular' && styles.circular,
        className,
      )}
      style={{
        width: toStyleValue(width),
        height: toStyleValue(height),
      }}
    />
  )
}
