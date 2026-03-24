import type Database from 'better-sqlite3'
import { getDb, getChecksInRange } from '../utils/db'

interface CheckDataPoint {
  timestamp: number
  avgLatency: number | null
  maxLatency: number | null
  totalChecks: number
  successCount: number
  failureCount: number
  uptime: number
}

interface ChecksResponse {
  range: string
  data: CheckDataPoint[]
}

const RANGE_CONFIG: Record<string, { ms: number; bucketMs: number | null }> = {
  '24h': { ms: 24 * 60 * 60 * 1000, bucketMs: null }, // raw
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, bucketMs: 3600000 }, // hourly
  '30d': { ms: 30 * 24 * 60 * 60 * 1000, bucketMs: 86400000 }, // daily
}

function aggregateBuckets(
  checks: Array<{ timestamp: number; status: string; latency: number | null }>,
  bucketMs: number
): CheckDataPoint[] {
  const buckets = new Map<number, typeof checks>()

  for (const check of checks) {
    const bucketKey = Math.floor(check.timestamp / bucketMs) * bucketMs
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, [])
    buckets.get(bucketKey)!.push(check)
  }

  const result: CheckDataPoint[] = []
  for (const [timestamp, items] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    const latencies = items.filter((c) => c.latency !== null).map((c) => c.latency!)
    const successCount = items.filter((c) => c.status === 'ok').length
    const failureCount = items.length - successCount

    result.push({
      timestamp,
      avgLatency: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      maxLatency: latencies.length > 0 ? Math.max(...latencies) : null,
      totalChecks: items.length,
      successCount,
      failureCount,
      uptime: items.length > 0 ? Math.round((successCount / items.length) * 1000) / 10 : 100,
    })
  }

  return result
}

export function buildChecksResponse(db: Database.Database, range: string): ChecksResponse {
  const validRange = RANGE_CONFIG[range] ? range : '24h'
  const config = RANGE_CONFIG[validRange]
  const now = Date.now()
  const from = now - config.ms

  const checks = getChecksInRange(db, from, now)

  let data: CheckDataPoint[]

  if (config.bucketMs === null) {
    // Raw data — wrap each check in the uniform format
    data = checks.map((c) => ({
      timestamp: c.timestamp,
      avgLatency: c.latency,
      maxLatency: c.latency,
      totalChecks: 1,
      successCount: c.status === 'ok' ? 1 : 0,
      failureCount: c.status !== 'ok' ? 1 : 0,
      uptime: c.status === 'ok' ? 100 : 0,
    }))
  } else {
    data = aggregateBuckets(checks, config.bucketMs)
  }

  return { range: validRange, data }
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const range = (query.range as string) || '24h'
  const db = getDb()
  return buildChecksResponse(db, range)
})
