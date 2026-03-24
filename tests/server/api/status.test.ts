import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDb, insertCheck } from '~/server/utils/db'
import { buildStatusResponse } from '~/server/api/status.get'

describe('GET /api/status', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initDb(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns correct status with recent checks', () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      insertCheck(db, {
        timestamp: now - i * 120000,
        status: 'ok',
        latency: 300 + i * 10,
        statusCode: 200,
        error: null,
      })
    }

    const result = buildStatusResponse(db)
    expect(result.status).toBe('operational')
    expect(result.latency).toBe(300)
    expect(result.statusCode).toBe(200)
    expect(result.recentChecks).toBe(5)
    expect(result.recentFailures).toBe(0)
    expect(result.uptime24h).toBe(100)
  })

  it('returns null fields when no checks exist', () => {
    const result = buildStatusResponse(db)
    expect(result.status).toBe('operational')
    expect(result.latency).toBeNull()
    expect(result.lastCheck).toBeNull()
  })

  it('calculates uptime correctly with failures', () => {
    const now = Date.now()
    for (let i = 0; i < 10; i++) {
      insertCheck(db, {
        timestamp: now - i * 120000,
        status: i < 2 ? 'error' : 'ok',
        latency: i < 2 ? null : 300,
        statusCode: i < 2 ? 500 : 200,
        error: i < 2 ? 'Server Error' : null,
      })
    }

    const result = buildStatusResponse(db)
    expect(result.uptime24h).toBe(80) // 8/10 = 80%
    expect(result.recentFailures).toBe(2)
  })
})
