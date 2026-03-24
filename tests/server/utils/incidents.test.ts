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
