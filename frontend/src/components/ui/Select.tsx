import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'
import styles from './Select.module.css'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helper?: string
  options: Array<{ value: string; label: string }>
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helper, options, className, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className={styles.wrapper}>
        {label && (
          <label htmlFor={selectId} className={styles.label}>
            {label}
          </label>
        )}
        <div className={styles.selectContainer}>
          <select
            ref={ref}
            id={selectId}
            className={cn(styles.select, error && styles.selectError, className)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? `${selectId}-error` : helper ? `${selectId}-helper` : undefined
            }
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={styles.chevron}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </div>
        {error && (
          <span id={`${selectId}-error`} className={styles.errorText} role="alert">
            {error}
          </span>
        )}
        {helper && !error && (
          <span id={`${selectId}-helper`} className={styles.helperText}>
            {helper}
          </span>
        )}
      </div>
    )
  },
)

Select.displayName = 'Select'
