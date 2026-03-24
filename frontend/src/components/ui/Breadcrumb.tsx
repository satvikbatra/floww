import { Link } from 'react-router-dom'
import { cn } from '../../utils/cn'
import styles from './Breadcrumb.module.css'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav className={cn(styles.container, className)} aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <span key={index} className={styles.itemWrapper}>
            {index > 0 && <span className={styles.separator}>/</span>}
            {isLast || !item.href ? (
              <span className={cn(styles.item, isLast && styles.current)}>{item.label}</span>
            ) : (
              <Link to={item.href} className={styles.link}>
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
