import crypto from 'crypto'
import { Session } from './session'

export class SessionPool {
  private sessions: Session[] = []
  private maxSessions: number

  constructor(maxSessions: number = 10) {
    this.maxSessions = maxSessions
  }

  /**
   * Get a usable session. Creates new one if needed.
   */
  getSession(options?: { proxyUrl?: string; userAgent?: string }): Session {
    // Find a good session
    const good = this.sessions.find(s => s.state === 'good')
    if (good) return good

    // Find a bad-but-not-retired session
    const bad = this.sessions.find(s => s.state === 'bad')
    if (bad) return bad

    // Create new session
    return this.createSession(options)
  }

  createSession(options?: { proxyUrl?: string; userAgent?: string }): Session {
    // Retire oldest if at capacity
    if (this.sessions.length >= this.maxSessions) {
      const oldest = this.sessions.shift()
      oldest?.retire()
    }

    const session = new Session(crypto.randomUUID(), options)
    this.sessions.push(session)
    return session
  }

  /**
   * Retire all bad sessions and replace them
   */
  cleanup(): void {
    this.sessions = this.sessions.filter(s => s.isUsable)
  }

  get activeSessions(): number {
    return this.sessions.filter(s => s.isUsable).length
  }

  get totalSessions(): number {
    return this.sessions.length
  }
}
