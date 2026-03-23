/**
 * Interactive Crawl Dialog Component
 * 
 * Shows real-time user interaction prompts during crawling
 */

import React, { useState, useEffect } from 'react'
import './InteractiveCrawlDialog.css'

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
    const ws = new WebSocket(`ws://localhost:8000/api/v1/ws/crawl/${sessionId}`)

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
      case 'login': return '🔐'
      case 'form': return '📝'
      case 'captcha': return '🤖'
      case '2fa': return '🔑'
      case 'confirmation': return '✓'
      default: return '⚠️'
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isVisible || !currentPrompt) return null

  return (
    <div className="interactive-dialog-overlay">
      <div className="interactive-dialog">
        <div className="dialog-header">
          <div className="header-icon">{getIcon(currentPrompt.type)}</div>
          <div className="header-content">
            <h2>User Action Required</h2>
            <p className="header-subtitle">{currentPrompt.type.toUpperCase()}</p>
          </div>
          <div className="header-countdown">
            <svg className="countdown-circle" width="48" height="48">
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="4"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="#667eea"
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${
                  2 * Math.PI * 20 * (1 - countdown / (currentPrompt.timeout / 1000))
                }`}
                strokeLinecap="round"
                transform="rotate(-90 24 24)"
              />
            </svg>
            <span className="countdown-text">{formatTime(countdown)}</span>
          </div>
        </div>

        <div className="dialog-body">
          <div className="page-info">
            <strong>Page:</strong> {currentPrompt.pageTitle}
            <br />
            <small>{currentPrompt.pageUrl}</small>
          </div>

          <div className="message-box">
            <div className="message-icon">💬</div>
            <p>{currentPrompt.message}</p>
          </div>

          <div className="instruction-box">
            <h3>What to do:</h3>
            <ol>
              <li>A browser window has opened automatically</li>
              <li>Complete the required action in that window</li>
              <li>Come back here and click "Continue Crawling"</li>
            </ol>
          </div>

          {prompts.length > 1 && (
            <div className="queue-info">
              <span className="badge">{prompts.length - 1} more prompts waiting</span>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button
            className="btn btn-primary"
            onClick={() => handleAction('continue')}
          >
            ✓ Continue Crawling
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleAction('skip')}
          >
            ⏭ Skip This Page
          </button>
          <button
            className="btn btn-danger"
            onClick={() => handleAction('cancel')}
          >
            ✕ Stop Crawling
          </button>
        </div>
      </div>
    </div>
  )
}
