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
