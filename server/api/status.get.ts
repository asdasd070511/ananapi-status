import type Database from 'better-sqlite3'
import { getDb, getRecentChecks, getChecksInRange } from '../utils/db'
import { determineStatus } from '../utils/status'

export interface StatusResponse {
  status: string
  latency: number | null
  statusCode: number | null
  uptime24h: number
  lastCheck: number | null
  recentChecks: number
  recentFailures: number
}

export function buildStatusResponse(db: Database.Database): StatusResponse {
  const recentChecks = getRecentChecks(db, 5)
  const overallStatus = determineStatus(recentChecks)

  const latest = recentChecks[0] ?? null

  // Calculate 24h uptime
  const now = Date.now()
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000
  const last24h = getChecksInRange(db, twentyFourHoursAgo, now)
  const successCount = last24h.filter((c) => c.status === 'ok').length
  const uptime24h = last24h.length > 0 ? Math.round((successCount / last24h.length) * 1000) / 10 : 100

  const failureCount = recentChecks.filter(
    (c) => c.status === 'error' || c.status === 'timeout'
  ).length

  return {
    status: overallStatus,
    latency: latest?.latency ?? null,
    statusCode: latest?.statusCode ?? null,
    uptime24h,
    lastCheck: latest?.timestamp ?? null,
    recentChecks: recentChecks.length,
    recentFailures: failureCount,
  }
}

export default defineEventHandler(() => {
  const db = getDb()
  return buildStatusResponse(db)
})
