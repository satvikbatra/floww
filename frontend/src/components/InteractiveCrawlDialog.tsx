/**
 * Interactive Crawl Dialog Component
 *
 * Shows real-time user interaction prompts during crawling
 */

import React, { useState, useEffect } from 'react'
import styles from './InteractiveCrawlDialog.module.css'

export interface InteractionPrompt {
  id: string
  sessionId: string
  type: 'login' | 'form' | 'captcha' | '2fa' | 'confirmation'
  pageUrl: string
  pageTitle: string
  message: string
  fields?: Array<{
    name: string
    label: string
    type: string
    required: boolean
    placeholder?: string
  }>
  actions: Array<{
    id: string
    label: string
    type: 'primary' | 'secondary' | 'danger'
  }>
  timeout: number
  createdAt: Date
}

interface InteractiveCrawlDialogProps {
  sessionId: string
  onAction: (promptId: string, action: string, data?: any) => void
}

export const InteractiveCrawlDialog: React.FC<InteractiveCrawlDialogProps> = ({
  sessionId,
  onAction,
}) => {
  const [prompts, setPrompts] = useState<InteractionPrompt[]>([])
  const [currentPrompt, setCurrentPrompt] = useState<InteractionPrompt | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [countdown, setCountdown] = useState<number>(0)

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8100/api/v1/ws/crawl/${sessionId}`)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'user:action:requested') {
        const prompt = data.data as InteractionPrompt
        setPrompts((prev) => [...prev, prompt])
        if (!currentPrompt) {
          setCurrentPrompt(prompt)
          setIsVisible(true)
          setCountdown(Math.floor(prompt.timeout / 1000))
        }
      }
    }

    return () => {
      ws.close()
    }
  }, [sessionId, currentPrompt])

  // Countdown timer
  useEffect(() => {
    if (!currentPrompt || countdown <= 0) return

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [currentPrompt, countdown])

  const handleAction = (action: string) => {
    if (!currentPrompt) return

    onAction(currentPrompt.id, action)

    // Move to next prompt
    const nextPrompts = prompts.filter((p) => p.id !== currentPrompt.id)
    setPrompts(nextPrompts)

    if (nextPrompts.length > 0) {
      setCurrentPrompt(nextPrompts[0])
      setCountdown(Math.floor(nextPrompts[0].timeout / 1000))
    } else {
      setCurrentPrompt(null)
      setIsVisible(false)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'login': return '\uD83D\uDD10'
      case 'form': return '\uD83D\uDCDD'
      case 'captcha': return '\uD83E\uDD16'
      case '2fa': return '\uD83D\uDD11'
      case 'confirmation': return '\u2713'
      default: return '\u26A0\uFE0F'
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isVisible || !currentPrompt) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={styles.headerIcon}>{getIcon(currentPrompt.type)}</div>
          <div className={styles.headerContent}>
            <h2>User Action Required</h2>
            <p className={styles.headerSubtitle}>{currentPrompt.type.toUpperCase()}</p>
          </div>
          <div className={styles.headerCountdown}>
            <svg className={styles.countdownCircle} width="48" height="48">
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="4"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="#fff"
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${
                  2 * Math.PI * 20 * (1 - countdown / (currentPrompt.timeout / 1000))
                }`}
                strokeLinecap="round"
                transform="rotate(-90 24 24)"
              />
            </svg>
            <span className={styles.countdownText}>{formatTime(countdown)}</span>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.pageInfo}>
            <strong>Page:</strong> {currentPrompt.pageTitle}
            <br />
            <small>{currentPrompt.pageUrl}</small>
          </div>

          <div className={styles.messageBox}>
            <div className={styles.messageIcon}>{'\uD83D\uDCAC'}</div>
            <p>{currentPrompt.message}</p>
          </div>

          <div className={styles.instructionBox}>
            <h3>What to do:</h3>
            <ol>
              <li>A browser window has opened automatically</li>
              <li>Complete the required action in that window</li>
              <li>Come back here and click "Continue Crawling"</li>
            </ol>
          </div>

          {prompts.length > 1 && (
            <div className={styles.queueInfo}>
              <span className={styles.badge}>{prompts.length - 1} more prompts waiting</span>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => handleAction('continue')}
          >
            &#x2713; Continue Crawling
          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => handleAction('skip')}
          >
            &#x23ED; Skip This Page
          </button>
          <button
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={() => handleAction('cancel')}
          >
            &#x2715; Stop Crawling
          </button>
        </div>
      </div>
    </div>
  )
}
