import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDb, insertCheck } from '~/server/utils/db'
import { buildChecksResponse } from '~/server/api/checks.get'

describe('GET /api/checks', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initDb(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns raw data for 24h range', () => {
    const now = Date.now()
    insertCheck(db, { timestamp: now - 60000, status: 'ok', latency: 300, statusCode: 200, error: null })
    insertCheck(db, { timestamp: now, status: 'ok', latency: 400, statusCode: 200, error: null })

    const result = buildChecksResponse(db, '24h')
    expect(result.range).toBe('24h')
    expect(result.data).toHaveLength(2)
    expect(result.data[0].totalChecks).toBe(1)
    expect(result.data[0].avgLatency).toBe(300)
  })

  it('aggregates by hour for 7d range', () => {
    const now = Date.now()
    const hourStart = now - (now % 3600000) // floor to hour

    // Insert 3 checks in the same hour
    insertCheck(db, { timestamp: hourStart + 1000, status: 'ok', latency: 200, statusCode: 200, error: null })
    insertCheck(db, { timestamp: hourStart + 2000, status: 'ok', latency: 400, statusCode: 200, error: null })
    insertCheck(db, { timestamp: hourStart + 3000, status: 'error', latency: null, statusCode: 500, error: 'err' })

    const result = buildChecksResponse(db, '7d')
    expect(result.range).toBe('7d')
    expect(result.data).toHaveLength(1)
    expect(result.data[0].totalChecks).toBe(3)
    expect(result.data[0].avgLatency).toBe(300) // (200+400)/2, null excluded
    expect(result.data[0].maxLatency).toBe(400)
    expect(result.data[0].successCount).toBe(2)
    expect(result.data[0].failureCount).toBe(1)
  })

  it('defaults to 24h for invalid range', () => {
    const result = buildChecksResponse(db, 'invalid')
    expect(result.range).toBe('24h')
  })

  it('returns empty data array when no checks', () => {
    const result = buildChecksResponse(db, '24h')
    expect(result.data).toEqual([])
  })
})
