import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'
import styles from './Table.module.css'

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className={styles.wrapper}>
        <table ref={ref} className={cn(styles.table, className)} {...props}>
          {children}
        </table>
      </div>
    )
  },
)
Table.displayName = 'Table'

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
  return <thead ref={ref} className={cn(styles.header, className)} {...props} />
})
TableHeader.displayName = 'TableHeader'

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
  return <tbody ref={ref} className={cn(styles.body, className)} {...props} />
})
TableBody.displayName = 'TableBody'

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => {
    return <tr ref={ref} className={cn(styles.row, className)} {...props} />
  },
)
TableRow.displayName = 'TableRow'

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    return <th ref={ref} className={cn(styles.head, className)} {...props} />
  },
)
TableHead.displayName = 'TableHead'

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    return <td ref={ref} className={cn(styles.cell, className)} {...props} />
  },
)
TableCell.displayName = 'TableCell'
