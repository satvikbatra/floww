import * as os from 'os'

export interface SystemSnapshot {
  cpuPercent: number
  memoryPercent: number
  freeMemoryMB: number
  totalMemoryMB: number
}

export class SystemMonitor {
  private lastCpuInfo: os.CpuInfo[] | null = null
  private lastCpuTime: number = 0

  getSnapshot(): SystemSnapshot {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const memoryPercent = ((totalMem - freeMem) / totalMem) * 100

    return {
      cpuPercent: this.getCpuPercent(),
      memoryPercent: Math.round(memoryPercent),
      freeMemoryMB: Math.round(freeMem / 1024 / 1024),
      totalMemoryMB: Math.round(totalMem / 1024 / 1024),
    }
  }

  private getCpuPercent(): number {
    const cpus = os.cpus()
    if (!this.lastCpuInfo) {
      this.lastCpuInfo = cpus
      this.lastCpuTime = Date.now()
      return 0
    }

    let totalIdle = 0
    let totalTick = 0

    for (let i = 0; i < cpus.length; i++) {
      const curr = cpus[i]
      const prev = this.lastCpuInfo[i] || curr

      const currTotal = Object.values(curr.times).reduce((a, b) => a + b, 0)
      const prevTotal = Object.values(prev.times).reduce((a, b) => a + b, 0)

      totalIdle += curr.times.idle - prev.times.idle
      totalTick += currTotal - prevTotal
    }

    this.lastCpuInfo = cpus
    this.lastCpuTime = Date.now()

    return totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100) : 0
  }
}
