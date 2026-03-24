import type { CheckRow } from './db'

export type OverallStatus = 'operational' | 'degraded' | 'down'

const LATENCY_THRESHOLD = 5000

export function determineStatus(recentChecks: CheckRow[]): OverallStatus {
  if (recentChecks.length === 0) return 'operational'

  const latest = recentChecks[0]
  const failureCount = recentChecks.filter(
    (c) => c.status === 'error' || c.status === 'timeout'
  ).length

  // Red: last check failed OR 3+ failures in window
  if (latest.status !== 'ok' || failureCount >= 3) {
    return 'down'
  }

  // Yellow: high latency OR 1-2 failures in window
  if ((latest.latency !== null && latest.latency >= LATENCY_THRESHOLD) || failureCount >= 1) {
    return 'degraded'
  }

  // Green: all good
  return 'operational'
}
