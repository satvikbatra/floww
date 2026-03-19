/**
 * Interactive Crawl Banner - Floating banner that shows when waiting for user input
 * 
 * Always visible when crawl needs input, with prominent Continue button
 */

import React, { useEffect, useState } from 'react'
import './InteractiveCrawlBanner.css'

interface InteractiveCrawlBannerProps {
  sessionId: string
  onContinue: () => void
  onSkip: () => void
  onStop: () => void
}

export const InteractiveCrawlBanner: React.FC<InteractiveCrawlBannerProps> = ({
  sessionId,
  onContinue,
  onSkip,
  onStop,
}) => {
  const [isWaiting, setIsWaiting] = useState(false)
  const [message, setMessage] = useState('')
  const [pageUrl, setPageUrl] = useState('')

  useEffect(() => {
    // Connect to WebSocket to listen for interaction events
    const ws = new WebSocket(`ws://localhost:8080/api/v1/ws/crawl/${sessionId}`)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'interaction:required' || data.type === 'user:action:requested') {
        setIsWaiting(true)
        setMessage(data.data?.message || 'Please complete the action in the browser')
        setPageUrl(data.data?.pageUrl || '')
      } else if (data.type === 'interaction:completed' || data.type === 'crawl:completed') {
        setIsWaiting(false)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    return () => {
      ws.close()
    }
  }, [sessionId])

  const handleContinue = () => {
    setIsWaiting(false)
    onContinue()
  }

  const handleSkip = () => {
    setIsWaiting(false)
    onSkip()
  }

  const handleStop = () => {
    setIsWaiting(false)
    onStop()
  }

  if (!isWaiting) return null

  return (
    <div className="crawl-banner-overlay">
      <div className="crawl-banner">
        <div className="banner-content">
          <div className="banner-icon">
            <div className="pulse-dot"></div>
            <span className="icon-emoji">🖥️</span>
          </div>
          <div className="banner-text">
            <h3 className="banner-title">⏸️ Waiting for Your Input</h3>
            <p className="banner-message">{message}</p>
            {pageUrl && (
              <p className="banner-url">
                <small>{pageUrl}</small>
              </p>
            )}
            <div className="banner-instructions">
              <p>✓ Complete the action in the browser window that opened</p>
              <p>✓ Then click "Continue Crawling" below</p>
            </div>
          </div>
        </div>
        <div className="banner-actions">
          <button 
            onClick={handleContinue} 
            className="banner-btn banner-btn-continue"
          >
            ✓ Continue Crawling
          </button>
          <button 
            onClick={handleSkip} 
            className="banner-btn banner-btn-skip"
          >
            ⏭ Skip This Page
          </button>
          <button 
            onClick={handleStop} 
            className="banner-btn banner-btn-stop"
          >
            ✕ Stop Crawling
          </button>
        </div>
      </div>
    </div>
  )
}
