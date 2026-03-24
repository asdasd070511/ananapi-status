# Ananapi Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public status page that monitors ananapi.com's OpenAI-compatible API every 2 minutes and displays real-time availability, latency charts, and incident history.

**Architecture:** Single Nuxt 3 process — server plugin runs `node-cron` to poll the API and write results to SQLite (WAL mode). Nitro API routes serve the data. Vue frontend renders a public status page with Chart.js.

**Tech Stack:** Nuxt 3, better-sqlite3, node-cron, Chart.js + vue-chartjs, date-fns, Tailwind CSS (via ui-ux-pro-max)

**Spec:** `docs/superpowers/specs/2026-03-24-ananapi-status-design.md`

---

## File Structure

```
ananapi-status/
├── nuxt.config.ts                  # Nuxt config: runtimeConfig, modules
├── package.json                    # Dependencies
├── .env                            # ANANAPI_KEY (gitignored)
├── .gitignore                      # node_modules, data/, .env, .nuxt, .output
├── tsconfig.json                   # TypeScript config (Nuxt auto-generates)
├── server/
│   ├── utils/db.ts                 # SQLite connection, schema init, query helpers
│   ├── utils/status.ts             # Status determination logic (green/yellow/red)
│   ├── utils/incidents.ts          # Incident grouping logic
│   ├── plugins/monitor.ts          # Cron job: health check + cleanup
│   └── api/
│       ├── status.get.ts           # GET /api/status
│       ├── checks.get.ts          # GET /api/checks?range=24h|7d|30d
│       └── incidents.get.ts       # GET /api/incidents (raw failure events)
├── pages/
│   └── index.vue                   # Main status page (assembles components)
├── components/
│   ├── StatusHeader.vue            # Header + overall status banner
│   ├── StatusCard.vue              # Endpoint status card with indicator
│   ├── LatencyChart.vue            # Chart.js line chart with range toggle
│   └── IncidentTimeline.vue        # Historical incident list
├── composables/
│   └── useStatusPolling.ts         # Polling logic with visibility pause
├── data/                           # SQLite file lives here (gitignored)
└── tests/
    └── server/
        ├── utils/db.test.ts        # DB helper tests
        ├── utils/status.test.ts    # Status logic tests
        ├── utils/incidents.test.ts # Incident grouping tests
        ├── api/status.test.ts      # /api/status endpoint tests
        └── api/checks.test.ts      # /api/checks endpoint tests
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `nuxt.config.ts`, `.env`, `.gitignore`

- [ ] **Step 1: Initialize Nuxt 3 project**

Run:
```bash
cd C:/Users/m1208/Desktop/ananapi-status
npx nuxi@latest init . --force --packageManager npm
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install better-sqlite3 node-cron chart.js vue-chartjs date-fns
npm install -D @types/better-sqlite3 vitest @nuxt/test-utils
```

- [ ] **Step 3: Create `.env` file**

```env
ANANAPI_KEY=sk-5235b05f13915409e6b9f695dfcb402d19415b66312f9030096376bc0bf654a1
```

- [ ] **Step 4: Create `.gitignore`**

```gitignore
node_modules/
.nuxt/
.output/
data/
.env
*.db
*.db-wal
*.db-shm
.superpowers/
```

- [ ] **Step 5: Configure `nuxt.config.ts`**

```typescript
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  runtimeConfig: {
    ananapiKey: process.env.ANANAPI_KEY || '',
  },
})
```

- [ ] **Step 6: Remove default `app.vue` and create `vitest.config.ts`**

Nuxt init creates `app.vue` which blocks `pages/` routing. Remove it:
```bash
rm -f app.vue
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 7: Create `data/` directory placeholder**

Run:
```bash
mkdir -p data
```

- [ ] **Step 8: Verify project runs**

Run:
```bash
npm run dev
```
Expected: Nuxt dev server starts without errors. Stop it after confirming.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Nuxt 3 project with dependencies"
```

---

### Task 2: SQLite Database Layer

**Files:**
- Create: `server/utils/db.ts`
- Test: `tests/server/utils/db.test.ts`

- [ ] **Step 1: Write failing tests for DB helpers**

Create `tests/server/utils/db.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/server/utils/db.test.ts
```
Expected: FAIL — module `~/server/utils/db` not found.

- [ ] **Step 3: Implement `server/utils/db.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/server/utils/db.test.ts
```
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/db.ts tests/server/utils/db.test.ts
git commit -m "feat: add SQLite database layer with query helpers"
```

---

### Task 3: Status Determination Logic

**Files:**
- Create: `server/utils/status.ts`
- Test: `tests/server/utils/status.test.ts`

- [ ] **Step 1: Write failing tests for status logic**

Create `tests/server/utils/status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { determineStatus } from '~/server/utils/status'
import type { CheckRow } from '~/server/utils/db'

function makeCheck(overrides: Partial<CheckRow> = {}): CheckRow {
  return {
    id: 1,
    timestamp: Date.now(),
    status: 'ok',
    latency: 300,
    statusCode: 200,
    error: null,
    ...overrides,
  }
}

describe('determineStatus', () => {
  it('returns "operational" when all recent checks pass with low latency', () => {
    const checks = Array.from({ length: 5 }, (_, i) =>
      makeCheck({ id: i + 1, timestamp: Date.now() - i * 120000, latency: 300 })
    )
    expect(determineStatus(checks)).toBe('operational')
  })

  it('returns "down" when last check failed', () => {
    const checks = [
      makeCheck({ status: 'error', latency: null, statusCode: 500, error: 'Server Error' }),
      ...Array.from({ length: 4 }, (_, i) =>
        makeCheck({ id: i + 2, timestamp: Date.now() - (i + 1) * 120000 })
      ),
    ]
    expect(determineStatus(checks)).toBe('down')
  })

  it('returns "down" when 3+ of last 5 checks failed', () => {
    const checks = [
      makeCheck({ status: 'ok', latency: 200 }),
      makeCheck({ status: 'error', latency: null, statusCode: 500, error: 'err' }),
      makeCheck({ status: 'timeout', latency: null, statusCode: null, error: 'timeout' }),
      makeCheck({ status: 'error', latency: null, statusCode: 502, error: 'err' }),
      makeCheck({ status: 'ok', latency: 200 }),
    ]
    expect(determineStatus(checks)).toBe('down')
  })

  it('returns "degraded" when last check has high latency', () => {
    const checks = Array.from({ length: 5 }, (_, i) =>
      makeCheck({ id: i + 1, timestamp: Date.now() - i * 120000, latency: i === 0 ? 6000 : 300 })
    )
    expect(determineStatus(checks)).toBe('degraded')
  })

  it('returns "degraded" when 1-2 of last 5 checks failed', () => {
    const checks = [
      makeCheck({ status: 'ok', latency: 200 }),
      makeCheck({ status: 'error', latency: null, statusCode: 500, error: 'err' }),
      makeCheck({ status: 'ok', latency: 200 }),
      makeCheck({ status: 'ok', latency: 200 }),
      makeCheck({ status: 'ok', latency: 200 }),
    ]
    expect(determineStatus(checks)).toBe('degraded')
  })

  it('returns "operational" when no checks exist', () => {
    expect(determineStatus([])).toBe('operational')
  })

  it('works with fewer than 5 checks', () => {
    const checks = [makeCheck({ status: 'ok', latency: 200 })]
    expect(determineStatus(checks)).toBe('operational')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/server/utils/status.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/utils/status.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/server/utils/status.test.ts
```
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/status.ts tests/server/utils/status.test.ts
git commit -m "feat: add status determination logic (green/yellow/red)"
```

---

### Task 4: Monitor Server Plugin

**Files:**
- Create: `server/plugins/monitor.ts`

- [ ] **Step 1: Implement the monitor plugin**

```typescript
import cron from 'node-cron'
import { getDb, closeDb, insertCheck, deleteOldChecks } from '../utils/db'
import { useRuntimeConfig } from '#imports'

let isRunning = false
let monitorTask: cron.ScheduledTask | null = null
let cleanupTask: cron.ScheduledTask | null = null

async function performHealthCheck(apiKey: string): Promise<void> {
  if (isRunning) {
    console.log('[monitor] Previous check still running, skipping')
    return
  }

  isRunning = true
  const db = getDb()
  const start = Date.now()

  try {
    const response = await $fetch.raw('http://ananapi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model: 'gpt-5.4',
        max_tokens: 1,
        stream: false,
        messages: [{ role: 'user', content: 'hi' }],
      },
      timeout: 30000,
    })

    const latency = Date.now() - start
    insertCheck(db, {
      timestamp: start,
      status: 'ok',
      latency,
      statusCode: response.status,
      error: null,
    })
    console.log(`[monitor] Check OK — ${latency}ms`)
  } catch (err: any) {
    const latency = Date.now() - start
    const isTimeout = latency >= 30000 || err?.name === 'AbortError' || err?.message?.includes('timeout')

    insertCheck(db, {
      timestamp: start,
      status: isTimeout ? 'timeout' : 'error',
      latency: isTimeout ? null : latency,
      statusCode: err?.response?.status ?? null,
      error: err?.message ?? String(err),
    })
    console.warn(`[monitor] Check FAILED — ${isTimeout ? 'timeout' : err?.message}`)
  } finally {
    isRunning = false
  }
}

export default defineNitroPlugin((nitro) => {
  const config = useRuntimeConfig()
  const apiKey = config.ananapiKey

  if (!apiKey) {
    console.warn('[monitor] ANANAPI_KEY not set — monitoring disabled')
    return
  }

  // Initialize DB on startup
  getDb()
  console.log('[monitor] Database initialized')

  // Health check every 2 minutes
  monitorTask = cron.schedule('*/2 * * * *', () => {
    performHealthCheck(apiKey)
  })

  // Run first check immediately
  performHealthCheck(apiKey)

  // Cleanup old data every hour
  cleanupTask = cron.schedule('0 * * * *', () => {
    const db = getDb()
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const deleted = deleteOldChecks(db, thirtyDaysAgo)
    if (deleted > 0) {
      console.log(`[monitor] Cleaned up ${deleted} old records`)
    }
  })

  console.log('[monitor] Started — checking every 2 minutes')

  // Graceful shutdown
  nitro.hooks.hook('close', () => {
    console.log('[monitor] Shutting down...')
    monitorTask?.stop()
    cleanupTask?.stop()
    closeDb()
  })
})
```

- [ ] **Step 2: Verify the plugin loads**

Run:
```bash
npm run dev
```
Expected: Console shows `[monitor] Database initialized` and `[monitor] Started`. First health check runs. Stop after confirming.

- [ ] **Step 3: Commit**

```bash
git add server/plugins/monitor.ts
git commit -m "feat: add monitor server plugin with cron health checks"
```

---

### Task 5: Status API Route

**Files:**
- Create: `server/api/status.get.ts`
- Test: `tests/server/api/status.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/server/api/status.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/server/api/status.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/api/status.get.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/server/api/status.test.ts
```
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/status.get.ts tests/server/api/status.test.ts
git commit -m "feat: add GET /api/status endpoint"
```

---

### Task 6: Checks API Route

**Files:**
- Create: `server/api/checks.get.ts`
- Test: `tests/server/api/checks.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/server/api/checks.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/server/api/checks.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `server/api/checks.get.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/server/api/checks.test.ts
```
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/checks.get.ts tests/server/api/checks.test.ts
git commit -m "feat: add GET /api/checks endpoint with range aggregation"
```

---

### Task 7: Polling Composable

**Files:**
- Create: `composables/useStatusPolling.ts`

- [ ] **Step 1: Implement polling composable**

```typescript
import { ref, watch, toValue, onMounted, onUnmounted, type MaybeRefOrGetter, type Ref } from 'vue'

export function useStatusPolling<T>(url: MaybeRefOrGetter<string>, intervalMs = 60000) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<Error | null>(null)
  const loading = ref(true)
  let timer: ReturnType<typeof setInterval> | null = null

  async function fetchData() {
    try {
      data.value = await $fetch<T>(toValue(url))
      error.value = null
    } catch (err: any) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  function startPolling() {
    stopPolling()
    timer = setInterval(fetchData, intervalMs)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function handleVisibility() {
    if (document.hidden) {
      stopPolling()
    } else {
      fetchData()
      startPolling()
    }
  }

  // Re-fetch when URL changes (reactive)
  watch(() => toValue(url), () => {
    fetchData()
  })

  onMounted(() => {
    fetchData()
    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)
  })

  onUnmounted(() => {
    stopPolling()
    document.removeEventListener('visibilitychange', handleVisibility)
  })

  return { data, error, loading, refresh: fetchData }
}
```

- [ ] **Step 2: Commit**

```bash
git add composables/useStatusPolling.ts
git commit -m "feat: add useStatusPolling composable with visibility pause"
```

---

### Task 8: Frontend — StatusHeader Component

**Files:**
- Create: `components/StatusHeader.vue`

- [ ] **Step 1: Implement StatusHeader**

This component receives the overall status and displays the header banner. Use @ui-ux-pro-max skill for styling.

```vue
<script setup lang="ts">
const props = defineProps<{
  status: 'operational' | 'degraded' | 'down' | null
}>()

const statusConfig = computed(() => {
  switch (props.status) {
    case 'operational':
      return { label: '所有系統正常運作', color: 'bg-emerald-500', textColor: 'text-emerald-500' }
    case 'degraded':
      return { label: '回應緩慢', color: 'bg-amber-500', textColor: 'text-amber-500' }
    case 'down':
      return { label: '服務異常', color: 'bg-red-500', textColor: 'text-red-500' }
    default:
      return { label: '載入中...', color: 'bg-gray-400', textColor: 'text-gray-400' }
  }
})
</script>

<template>
  <header>
    <h1>Ananapi Status</h1>
    <div :class="statusConfig.color" class="status-banner">
      <span class="status-dot" />
      <span>{{ statusConfig.label }}</span>
    </div>
  </header>
</template>
```

**Note:** Final styling will be applied by `ui-ux-pro-max` skill during Task 10.

- [ ] **Step 2: Commit**

```bash
git add components/StatusHeader.vue
git commit -m "feat: add StatusHeader component"
```

---

### Task 9: Frontend — StatusCard, LatencyChart, IncidentTimeline

**Files:**
- Create: `components/StatusCard.vue`
- Create: `components/LatencyChart.vue`
- Create: `components/IncidentTimeline.vue`

- [ ] **Step 1: Implement StatusCard**

```vue
<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const props = defineProps<{
  status: 'operational' | 'degraded' | 'down' | null
  latency: number | null
  uptime24h: number
  lastCheck: number | null
}>()

const statusDot = computed(() => {
  switch (props.status) {
    case 'operational': return 'bg-emerald-500'
    case 'degraded': return 'bg-amber-500'
    case 'down': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
})

const lastCheckFormatted = computed(() => {
  if (!props.lastCheck) return '---'
  return formatDistanceToNow(props.lastCheck, { addSuffix: true, locale: zhTW })
})
</script>

<template>
  <div class="status-card">
    <div class="card-header">
      <span :class="statusDot" class="dot" />
      <span class="endpoint-name">OpenAI API (gpt-5.4)</span>
    </div>
    <div class="card-metrics">
      <div class="metric">
        <span class="metric-label">回應時間</span>
        <span class="metric-value">{{ latency !== null ? `${latency}ms` : '---' }}</span>
      </div>
      <div class="metric">
        <span class="metric-label">24h Uptime</span>
        <span class="metric-value">{{ uptime24h }}%</span>
      </div>
      <div class="metric">
        <span class="metric-label">最後檢查</span>
        <span class="metric-value">{{ lastCheckFormatted }}</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Implement LatencyChart**

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { format } from 'date-fns'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface DataPoint {
  timestamp: number
  avgLatency: number | null
  failureCount: number
}

const props = defineProps<{
  data: DataPoint[]
  range: string
}>()

const emit = defineEmits<{
  'update:range': [value: string]
}>()

const ranges = ['24h', '7d', '30d']

const timeFormat = computed(() => {
  switch (props.range) {
    case '24h': return 'HH:mm'
    case '7d': return 'MM/dd HH:mm'
    case '30d': return 'MM/dd'
    default: return 'HH:mm'
  }
})

const chartData = computed(() => ({
  labels: props.data.map((d) => format(d.timestamp, timeFormat.value)),
  datasets: [
    {
      label: '回應時間 (ms)',
      data: props.data.map((d) => d.avgLatency),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      pointBackgroundColor: props.data.map((d) =>
        d.failureCount > 0 ? '#ef4444' : '#10b981'
      ),
      pointRadius: props.data.map((d) => (d.failureCount > 0 ? 5 : 2)),
      fill: true,
      tension: 0.3,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `${ctx.parsed.y ?? 'N/A'} ms`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: 'ms' },
    },
  },
}))
</script>

<template>
  <div class="latency-chart">
    <div class="chart-header">
      <h2>回應時間</h2>
      <div class="range-toggle">
        <button
          v-for="r in ranges"
          :key="r"
          :class="{ active: range === r }"
          @click="emit('update:range', r)"
        >
          {{ r }}
        </button>
      </div>
    </div>
    <div class="chart-container">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Implement IncidentTimeline**

This component receives pre-computed incidents from the `/api/incidents` endpoint:

```vue
<script setup lang="ts">
import { format, formatDuration, intervalToDuration } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export interface Incident {
  startTime: number
  endTime: number
  failureCount: number
  error: string | null
}

const props = defineProps<{
  incidents: Incident[]
}>()

function formatIncidentDuration(start: number, end: number): string {
  if (start === end) return '單次'
  const duration = intervalToDuration({ start, end })
  return formatDuration(duration, { locale: zhTW }) || '< 1 分鐘'
}
</script>

<template>
  <div class="incident-timeline">
    <h2>歷史事件</h2>
    <div v-if="incidents.length === 0" class="no-incidents">
      近期無異常事件
    </div>
    <div v-for="(incident, i) in incidents" :key="i" class="incident">
      <div class="incident-dot" />
      <div class="incident-content">
        <div class="incident-time">
          {{ format(incident.startTime, 'MM/dd HH:mm') }}
          <span v-if="incident.startTime !== incident.endTime">
            — {{ format(incident.endTime, 'HH:mm') }}
          </span>
        </div>
        <div class="incident-details">
          持續 {{ formatIncidentDuration(incident.startTime, incident.endTime) }}
          · {{ incident.failureCount }} 次失敗
        </div>
        <div v-if="incident.error" class="incident-error">
          {{ incident.error }}
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add components/StatusCard.vue components/LatencyChart.vue components/IncidentTimeline.vue
git commit -m "feat: add StatusCard, LatencyChart, IncidentTimeline components"
```

---

### Task 10: Incident Grouping Logic + API

**Files:**
- Create: `server/utils/incidents.ts`
- Create: `server/api/incidents.get.ts`
- Test: `tests/server/utils/incidents.test.ts`

- [ ] **Step 1: Write failing tests for incident grouping**

Create `tests/server/utils/incidents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { groupIncidents } from '~/server/utils/incidents'

describe('groupIncidents', () => {
  it('groups consecutive failures into one incident', () => {
    const checks = [
      { timestamp: 1000, status: 'ok', error: null },
      { timestamp: 2000, status: 'error', error: 'Server Error' },
      { timestamp: 3000, status: 'error', error: 'Server Error' },
      { timestamp: 4000, status: 'ok', error: null },
    ]
    const incidents = groupIncidents(checks)
    expect(incidents).toHaveLength(1)
    expect(incidents[0].startTime).toBe(2000)
    expect(incidents[0].endTime).toBe(3000)
    expect(incidents[0].failureCount).toBe(2)
    expect(incidents[0].error).toBe('Server Error')
  })

  it('breaks incidents on success', () => {
    const checks = [
      { timestamp: 1000, status: 'error', error: 'err1' },
      { timestamp: 2000, status: 'ok', error: null },
      { timestamp: 3000, status: 'timeout', error: 'timeout' },
    ]
    const incidents = groupIncidents(checks)
    expect(incidents).toHaveLength(2)
  })

  it('returns newest incidents first', () => {
    const checks = [
      { timestamp: 1000, status: 'error', error: 'old' },
      { timestamp: 2000, status: 'ok', error: null },
      { timestamp: 3000, status: 'error', error: 'new' },
    ]
    const incidents = groupIncidents(checks)
    expect(incidents[0].error).toBe('new')
  })

  it('returns empty array for no failures', () => {
    const checks = [
      { timestamp: 1000, status: 'ok', error: null },
      { timestamp: 2000, status: 'ok', error: null },
    ]
    expect(groupIncidents(checks)).toEqual([])
  })

  it('picks most common error message in group', () => {
    const checks = [
      { timestamp: 1000, status: 'error', error: 'rate limit' },
      { timestamp: 2000, status: 'error', error: 'rate limit' },
      { timestamp: 3000, status: 'error', error: 'timeout' },
    ]
    const incidents = groupIncidents(checks)
    expect(incidents[0].error).toBe('rate limit')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/server/utils/incidents.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `server/utils/incidents.ts`**

```typescript
export interface Incident {
  startTime: number
  endTime: number
  failureCount: number
  error: string | null
}

interface CheckInput {
  timestamp: number
  status: string
  error: string | null
}

export function groupIncidents(checks: CheckInput[]): Incident[] {
  const sorted = [...checks].sort((a, b) => a.timestamp - b.timestamp)
  const result: Incident[] = []
  let currentErrors: CheckInput[] = []

  function flushGroup() {
    if (currentErrors.length === 0) return
    // Find most common error message
    const errorCounts = new Map<string, number>()
    for (const c of currentErrors) {
      const msg = c.error ?? 'Unknown error'
      errorCounts.set(msg, (errorCounts.get(msg) ?? 0) + 1)
    }
    let mostCommon: string | null = null
    let maxCount = 0
    for (const [msg, count] of errorCounts) {
      if (count > maxCount) { mostCommon = msg; maxCount = count }
    }

    result.push({
      startTime: currentErrors[0].timestamp,
      endTime: currentErrors[currentErrors.length - 1].timestamp,
      failureCount: currentErrors.length,
      error: mostCommon,
    })
    currentErrors = []
  }

  for (const check of sorted) {
    if (check.status === 'error' || check.status === 'timeout') {
      currentErrors.push(check)
    } else {
      flushGroup()
    }
  }
  flushGroup()

  return result.reverse() // newest first
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/server/utils/incidents.test.ts
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Implement `server/api/incidents.get.ts`**

```typescript
import { getDb, getChecksInRange } from '../utils/db'
import { groupIncidents } from '../utils/incidents'

export default defineEventHandler(() => {
  const db = getDb()
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const checks = getChecksInRange(db, sevenDaysAgo, now)

  return {
    incidents: groupIncidents(
      checks.map((c) => ({
        timestamp: c.timestamp,
        status: c.status,
        error: c.error,
      }))
    ),
  }
})
```

- [ ] **Step 6: Commit**

```bash
git add server/utils/incidents.ts server/api/incidents.get.ts tests/server/utils/incidents.test.ts
git commit -m "feat: add incident grouping logic and GET /api/incidents endpoint"
```

---

### Task 11: Main Page + UI/UX Design

**Files:**
- Create: `pages/index.vue`

- [ ] **Step 1: Implement `pages/index.vue`**

Note: `LatencyChart` uses Chart.js which does not support SSR — must wrap in `<ClientOnly>`. `useStatusPolling` accepts reactive URL via `MaybeRefOrGetter`.

```vue
<script setup lang="ts">
import { useStatusPolling } from '~/composables/useStatusPolling'
import type { Incident } from '~/server/utils/incidents'

interface StatusData {
  status: 'operational' | 'degraded' | 'down'
  latency: number | null
  statusCode: number | null
  uptime24h: number
  lastCheck: number | null
  recentChecks: number
  recentFailures: number
}

interface CheckDataPoint {
  timestamp: number
  avgLatency: number | null
  maxLatency: number | null
  totalChecks: number
  successCount: number
  failureCount: number
  uptime: number
}

interface ChecksData {
  range: string
  data: CheckDataPoint[]
}

interface IncidentsData {
  incidents: Incident[]
}

const selectedRange = ref('24h')

const { data: statusData } = useStatusPolling<StatusData>('/api/status')

const { data: checksData } = useStatusPolling<ChecksData>(
  () => `/api/checks?range=${selectedRange.value}`
)

const { data: incidentsData } = useStatusPolling<IncidentsData>('/api/incidents')

useHead({
  title: 'Ananapi Status',
  meta: [
    { name: 'description', content: 'Ananapi API 即時運行狀態與可用性監測' },
  ],
})
</script>

<template>
  <div class="status-page">
    <StatusHeader :status="statusData?.status ?? null" />

    <main>
      <StatusCard
        :status="statusData?.status ?? null"
        :latency="statusData?.latency ?? null"
        :uptime24h="statusData?.uptime24h ?? 100"
        :last-check="statusData?.lastCheck ?? null"
      />

      <ClientOnly>
        <LatencyChart
          :data="checksData?.data ?? []"
          :range="selectedRange"
          @update:range="selectedRange = $event"
        />
      </ClientOnly>

      <IncidentTimeline
        :incidents="incidentsData?.incidents ?? []"
      />
    </main>

    <footer>
      <p>每 2 分鐘自動監測 · 頁面每 60 秒自動刷新</p>
    </footer>
  </div>
</template>
```

- [ ] **Step 2: Apply ui-ux-pro-max styling**

Invoke the `ui-ux-pro-max` skill to design the complete page. Reference: Instatus / Betterstack visual style. Requirements:
- Dark/light clean aesthetic
- Responsive layout (mobile + desktop)
- Status banner with color transitions
- Card with shadow and rounded corners
- Chart container with proper sizing
- Timeline with vertical line and dots
- Smooth hover effects and transitions

- [ ] **Step 3: Verify the full app works end-to-end**

Run:
```bash
npm run dev
```
Expected: Page loads at `http://localhost:3000`, shows status header, card, chart, and timeline. Data populates after first health check runs.

- [ ] **Step 4: Commit**

```bash
git add pages/index.vue
git commit -m "feat: add main status page with all components"
```

---

### Task 12: Final Polish and Verification

**Files:**
- Modify: various files for polish

- [ ] **Step 1: Run all tests**

Run:
```bash
npx vitest run
```
Expected: All tests pass.

- [ ] **Step 2: Test with dev server**

Run:
```bash
npm run dev
```

Manual verification checklist:
- [ ] Status header shows correct status color
- [ ] Status card shows latency, uptime, last check time
- [ ] Chart renders with data points after a few minutes
- [ ] Range toggle (24h/7d/30d) switches chart data
- [ ] Page auto-refreshes without full reload
- [ ] Mobile responsive layout works
- [ ] Incident timeline shows "近期無異常事件" when no failures

- [ ] **Step 3: Build for production**

Run:
```bash
npm run build
npm run preview
```
Expected: Production build succeeds, preview server runs correctly.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final polish and production build verification"
```
