import { useState, useRef, useEffect, type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import styles from './Dropdown.module.css'

export interface DropdownItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

export interface DropdownProps {
  trigger: ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
  className?: string
}

export function Dropdown({
  trigger,
  items,
  align = 'right',
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return (
    <div ref={wrapperRef} className={cn(styles.wrapper, className)}>
      <div onClick={() => setIsOpen((prev) => !prev)}>{trigger}</div>

      {isOpen && (
        <div className={cn(styles.menu, styles[align])}>
          {items.map((item, index) => {
            if (item.divider) {
              return <div key={index} className={styles.divider} />
            }

            return (
              <button
                key={index}
                className={cn(styles.item, item.danger && styles.danger)}
                onClick={() => {
                  item.onClick()
                  setIsOpen(false)
                }}
              >
                {item.icon && <span className={styles.icon}>{item.icon}</span>}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
