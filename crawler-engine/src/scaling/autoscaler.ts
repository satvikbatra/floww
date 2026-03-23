import { SystemMonitor } from './system-monitor'

export class Autoscaler {
  private monitor: SystemMonitor
  private maxConcurrency: number
  private maxCpuPercent: number
  private maxMemoryPercent: number
  private currentConcurrency: number

  constructor(config: {
    maxConcurrency: number
    maxCpuPercent: number
    maxMemoryPercent: number
  }) {
    this.monitor = new SystemMonitor()
    this.maxConcurrency = config.maxConcurrency
    this.maxCpuPercent = config.maxCpuPercent
    this.maxMemoryPercent = config.maxMemoryPercent
    this.currentConcurrency = 1
  }

  /**
   * Get the recommended concurrency level based on current system load
   */
  getDesiredConcurrency(): number {
    const snapshot = this.monitor.getSnapshot()

    if (snapshot.cpuPercent > this.maxCpuPercent || snapshot.memoryPercent > this.maxMemoryPercent) {
      // System under pressure — scale down
      this.currentConcurrency = Math.max(1, this.currentConcurrency - 1)
    } else if (snapshot.cpuPercent < this.maxCpuPercent * 0.7 && snapshot.memoryPercent < this.maxMemoryPercent * 0.7) {
      // System has headroom — scale up
      this.currentConcurrency = Math.min(this.maxConcurrency, this.currentConcurrency + 1)
    }

    return this.currentConcurrency
  }

  /**
   * Check if the system can accept a new task
   */
  canAcceptTask(): boolean {
    const snapshot = this.monitor.getSnapshot()
    return snapshot.cpuPercent < this.maxCpuPercent && snapshot.memoryPercent < this.maxMemoryPercent
  }

  getSystemSnapshot() {
    return this.monitor.getSnapshot()
  }
}
