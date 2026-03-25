/**
 * Interactive Crawl Banner - Floating banner that shows when waiting for user input
 *
 * Always visible when crawl needs input, with prominent Continue button
 */

import React, { useEffect, useState } from 'react'
import styles from './InteractiveCrawlBanner.module.css'

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
    const ws = new WebSocket(`ws://localhost:8100/api/v1/ws/crawl/${sessionId}`)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'interaction:required' || data.type === 'user:action:requested' || data.type === 'interactive:login:started') {
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
    <div className={styles.overlay}>
      <div className={styles.banner}>
        <div className={styles.content}>
          <div className={styles.iconWrapper}>
            <div className={styles.pulseDot}></div>
            <span className={styles.iconEmoji}>&#x1F5A5;&#xFE0F;</span>
          </div>
          <div className={styles.text}>
            <h3 className={styles.title}>&#x23F8;&#xFE0F; Waiting for Your Input</h3>
            <p className={styles.messageText}>{message}</p>
            {pageUrl && (
              <p className={styles.url}>
                <small className={styles.urlCode}>{pageUrl}</small>
              </p>
            )}
            <div className={styles.instructions}>
              <p>&#x2713; Complete the action in the browser window that opened</p>
              <p>&#x2713; Then click "Continue Crawling" below</p>
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            onClick={handleContinue}
            className={`${styles.btn} ${styles.btnContinue}`}
          >
            &#x2713; Continue Crawling
          </button>
          <button
            onClick={handleSkip}
            className={`${styles.btn} ${styles.btnSkip}`}
          >
            &#x23ED; Skip This Page
          </button>
          <button
            onClick={handleStop}
            className={`${styles.btn} ${styles.btnStop}`}
          >
            &#x2715; Stop Crawling
          </button>
        </div>
      </div>
    </div>
  )
}
