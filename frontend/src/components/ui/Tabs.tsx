import { type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import styles from './Tabs.module.css'

export interface Tab {
  id: string
  label: string
  icon?: ReactNode
  count?: number
}

export interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn(styles.container, className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={cn(styles.tab, tab.id === activeTab && styles.active)}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.icon && <span className={styles.icon}>{tab.icon}</span>}
          {tab.label}
          {tab.count !== undefined && (
            <span className={styles.count}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
