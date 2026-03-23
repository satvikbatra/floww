export interface TrackedError {
  type: string
  message: string
  url: string
  timestamp: Date
  retryAttempt: number
}

export class ErrorTracker {
  private errors: TrackedError[] = []
  private maxErrors = 1000

  track(url: string, error: Error, retryAttempt: number = 0): void {
    this.errors.push({
      type: error.constructor.name,
      message: error.message.substring(0, 500),
      url,
      timestamp: new Date(),
      retryAttempt,
    })

    // Keep bounded
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors)
    }
  }

  getGrouped(): Record<string, { count: number; urls: string[]; lastSeen: Date }> {
    const groups: Record<string, { count: number; urls: string[]; lastSeen: Date }> = {}

    for (const err of this.errors) {
      const key = `${err.type}: ${err.message.substring(0, 100)}`
      if (!groups[key]) {
        groups[key] = { count: 0, urls: [], lastSeen: err.timestamp }
      }
      groups[key].count++
      if (groups[key].urls.length < 5) groups[key].urls.push(err.url)
      groups[key].lastSeen = err.timestamp
    }

    return groups
  }

  getRecent(count: number = 10): TrackedError[] {
    return this.errors.slice(-count)
  }

  get total(): number { return this.errors.length }

  clear(): void { this.errors = [] }
}
