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
