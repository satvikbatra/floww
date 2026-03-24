import { forwardRef, type ReactNode, type InputHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'
import styles from './Input.module.css'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helper?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className={styles.wrapper}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}
        <div className={styles.inputContainer}>
          {leftIcon && <span className={styles.leftIconWrapper}>{leftIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              styles.input,
              !!leftIcon && styles.hasLeftIcon,
              !!rightIcon && styles.hasRightIcon,
              !!error && styles.inputError,
              className,
            )}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          {rightIcon && <span className={styles.rightIconWrapper}>{rightIcon}</span>}
        </div>
        {error && (
          <span id={`${inputId}-error`} className={styles.errorText} role="alert">
            {error}
          </span>
        )}
        {helper && !error && (
          <span id={`${inputId}-helper`} className={styles.helperText}>
            {helper}
          </span>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
