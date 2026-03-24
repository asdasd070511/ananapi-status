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
