import { useState } from 'react'
import { cn } from '../../utils/cn'
import styles from './Avatar.module.css'

const AVATAR_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#6366f1',
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  return Math.abs(hash)
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return (words[0]?.[0] ?? '').toUpperCase()
}

export interface AvatarProps {
  src?: string
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)

  const showImage = src && !imgFailed
  const bgColor = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length]

  return (
    <div
      className={cn(styles.avatar, styles[size], className)}
      style={showImage ? undefined : { backgroundColor: bgColor }}
      title={name}
    >
      {showImage ? (
        <img
          className={styles.image}
          src={src}
          alt={name}
          onError={() => setImgFailed(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  )
}
