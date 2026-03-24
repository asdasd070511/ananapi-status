import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'

export interface CheckRecord {
  timestamp: number
  status: 'ok' | 'error' | 'timeout'
  latency: number | null
  statusCode: number | null
  error: string | null
}

export interface CheckRow extends CheckRecord {
  id: number
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    const dataDir = join(process.cwd(), 'data')
    mkdirSync(dataDir, { recursive: true })
    _db = new Database(join(dataDir, 'db.sqlite'))
    initDb(_db)
  }
  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

export function initDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS checks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   INTEGER NOT NULL,
      status      TEXT    NOT NULL,
      latency     INTEGER,
      status_code INTEGER,
      error       TEXT
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_checks_timestamp ON checks(timestamp)')
}

export function insertCheck(db: Database.Database, check: CheckRecord): void {
  const stmt = db.prepare(
    'INSERT INTO checks (timestamp, status, latency, status_code, error) VALUES (?, ?, ?, ?, ?)'
  )
  stmt.run(check.timestamp, check.status, check.latency, check.statusCode, check.error)
}

export function getRecentChecks(db: Database.Database, limit: number): CheckRow[] {
  return db.prepare(
    'SELECT id, timestamp, status, latency, status_code as statusCode, error FROM checks ORDER BY timestamp DESC LIMIT ?'
  ).all(limit) as CheckRow[]
}

export function getChecksInRange(db: Database.Database, from: number, to: number): CheckRow[] {
  return db.prepare(
    'SELECT id, timestamp, status, latency, status_code as statusCode, error FROM checks WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
  ).all(from, to) as CheckRow[]
}

export function deleteOldChecks(db: Database.Database, olderThan: number): number {
  const result = db.prepare('DELETE FROM checks WHERE timestamp < ?').run(olderThan)
  return result.changes
}
