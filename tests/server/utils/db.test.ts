import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDb, insertCheck, getRecentChecks, getChecksInRange, deleteOldChecks } from '~/server/utils/db'

describe('db utils', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initDb(db)
  })

  afterEach(() => {
    db.close()
  })

  it('creates checks table on init', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checks'").get()
    expect(tables).toBeTruthy()
  })

  it('inserts a check record', () => {
    insertCheck(db, {
      timestamp: Date.now(),
      status: 'ok',
      latency: 342,
      statusCode: 200,
      error: null,
    })
    const count = db.prepare('SELECT COUNT(*) as c FROM checks').get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('gets recent checks ordered by timestamp desc', () => {
    const now = Date.now()
    insertCheck(db, { timestamp: now - 2000, status: 'ok', latency: 100, statusCode: 200, error: null })
    insertCheck(db, { timestamp: now - 1000, status: 'error', latency: null, statusCode: 500, error: 'Server Error' })
    insertCheck(db, { timestamp: now, status: 'ok', latency: 200, statusCode: 200, error: null })

    const recent = getRecentChecks(db, 2)
    expect(recent).toHaveLength(2)
    expect(recent[0].timestamp).toBe(now)
    expect(recent[1].timestamp).toBe(now - 1000)
  })

  it('gets checks in a time range', () => {
    const now = Date.now()
    insertCheck(db, { timestamp: now - 90000000, status: 'ok', latency: 100, statusCode: 200, error: null }) // ~25h ago
    insertCheck(db, { timestamp: now - 3600000, status: 'ok', latency: 200, statusCode: 200, error: null })  // 1h ago
    insertCheck(db, { timestamp: now, status: 'ok', latency: 300, statusCode: 200, error: null })

    const checks = getChecksInRange(db, now - 86400000, now) // last 24h
    expect(checks).toHaveLength(2)
  })

  it('deletes checks older than a given timestamp', () => {
    const now = Date.now()
    insertCheck(db, { timestamp: now - 90000000, status: 'ok', latency: 100, statusCode: 200, error: null })
    insertCheck(db, { timestamp: now, status: 'ok', latency: 200, statusCode: 200, error: null })

    deleteOldChecks(db, now - 86400000)
    const count = db.prepare('SELECT COUNT(*) as c FROM checks').get() as { c: number }
    expect(count.c).toBe(1)
  })
})
