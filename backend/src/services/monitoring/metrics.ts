/**
 * Metrics Collector — Prometheus-compatible metrics endpoint
 *
 * Exposes: request counts, latencies, crawl stats, system resources,
 * active connections, error rates.
 *
 * Consume via: GET /metrics (Prometheus scrape format)
 */

import { apiLogger } from '../../utils/logger'
import * as os from 'os'

interface Counter {
  name: string
  help: string
  labels: Record<string, number>
}

interface Gauge {
  name: string
  help: string
  value: number
}

interface Histogram {
  name: string
  help: string
  sum: number
  count: number
  buckets: Map<number, number>
}

class MetricsCollector {
  private counters = new Map<string, Counter>()
  private gauges = new Map<string, Gauge>()
  private histograms = new Map<string, Histogram>()

  /**
   * Increment a counter
   */
  increment(name: string, label: string = 'total', help: string = ''): void {
    let counter = this.counters.get(name)
    if (!counter) {
      counter = { name, help, labels: {} }
      this.counters.set(name, counter)
    }
    counter.labels[label] = (counter.labels[label] || 0) + 1
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, help: string = ''): void {
    this.gauges.set(name, { name, help, value })
  }

  /**
   * Record a histogram observation
   */
  observe(name: string, value: number, help: string = ''): void {
    let hist = this.histograms.get(name)
    if (!hist) {
      hist = {
        name,
        help,
        sum: 0,
        count: 0,
        buckets: new Map([
          [0.01, 0], [0.05, 0], [0.1, 0], [0.25, 0], [0.5, 0],
          [1, 0], [2.5, 0], [5, 0], [10, 0], [30, 0], [60, 0],
        ]),
      }
      this.histograms.set(name, hist)
    }
    hist.sum += value
    hist.count += 1
    for (const [bucket] of hist.buckets) {
      if (value <= bucket) {
        hist.buckets.set(bucket, (hist.buckets.get(bucket) || 0) + 1)
      }
    }
  }

  /**
   * Generate Prometheus-compatible text output
   */
  toPrometheus(): string {
    const lines: string[] = []

    // System metrics
    const cpus = os.cpus()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const loadAvg = os.loadavg()

    lines.push('# HELP floww_system_memory_used_bytes Memory used in bytes')
    lines.push('# TYPE floww_system_memory_used_bytes gauge')
    lines.push(`floww_system_memory_used_bytes ${totalMem - freeMem}`)

    lines.push('# HELP floww_system_memory_total_bytes Total memory in bytes')
    lines.push('# TYPE floww_system_memory_total_bytes gauge')
    lines.push(`floww_system_memory_total_bytes ${totalMem}`)

    lines.push('# HELP floww_system_cpu_count Number of CPUs')
    lines.push('# TYPE floww_system_cpu_count gauge')
    lines.push(`floww_system_cpu_count ${cpus.length}`)

    lines.push('# HELP floww_system_load_average_1m Load average 1 minute')
    lines.push('# TYPE floww_system_load_average_1m gauge')
    lines.push(`floww_system_load_average_1m ${loadAvg[0]}`)

    lines.push('# HELP floww_process_uptime_seconds Process uptime')
    lines.push('# TYPE floww_process_uptime_seconds gauge')
    lines.push(`floww_process_uptime_seconds ${Math.round(process.uptime())}`)

    lines.push('# HELP floww_process_rss_bytes Resident set size')
    lines.push('# TYPE floww_process_rss_bytes gauge')
    lines.push(`floww_process_rss_bytes ${process.memoryUsage().rss}`)

    // Counters
    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`)
      lines.push(`# TYPE ${counter.name} counter`)
      for (const [label, value] of Object.entries(counter.labels)) {
        lines.push(`${counter.name}{label="${label}"} ${value}`)
      }
    }

    // Gauges
    for (const gauge of this.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`)
      lines.push(`# TYPE ${gauge.name} gauge`)
      lines.push(`${gauge.name} ${gauge.value}`)
    }

    // Histograms
    for (const hist of this.histograms.values()) {
      lines.push(`# HELP ${hist.name} ${hist.help}`)
      lines.push(`# TYPE ${hist.name} histogram`)
      for (const [bucket, count] of hist.buckets) {
        lines.push(`${hist.name}_bucket{le="${bucket}"} ${count}`)
      }
      lines.push(`${hist.name}_bucket{le="+Inf"} ${hist.count}`)
      lines.push(`${hist.name}_sum ${hist.sum}`)
      lines.push(`${hist.name}_count ${hist.count}`)
    }

    return lines.join('\n') + '\n'
  }

  /**
   * Get summary as JSON (for /health endpoint enrichment)
   */
  toJSON(): Record<string, any> {
    const result: Record<string, any> = {}
    for (const [name, counter] of this.counters) {
      result[name] = counter.labels
    }
    for (const [name, gauge] of this.gauges) {
      result[name] = gauge.value
    }
    return result
  }
}

export const metrics = new MetricsCollector()
