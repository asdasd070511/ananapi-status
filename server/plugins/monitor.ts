import cron, { type ScheduledTask } from 'node-cron'
import { getDb, closeDb, insertCheck, deleteOldChecks } from '../utils/db'
import { useRuntimeConfig } from '#imports'

let isRunning = false
let monitorTask: ScheduledTask | null = null
let cleanupTask: ScheduledTask | null = null

async function performHealthCheck(apiKey: string): Promise<void> {
  if (isRunning) {
    console.log('[monitor] Previous check still running, skipping')
    return
  }

  isRunning = true
  const db = getDb()
  const start = Date.now()

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

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
      signal: controller.signal,
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
    const isTimeout =
      err?.name === 'AbortError' ||
      err?.cause?.name === 'AbortError' ||
      latency >= 30000 ||
      err?.message?.toLowerCase().includes('timeout')

    insertCheck(db, {
      timestamp: start,
      status: isTimeout ? 'timeout' : 'error',
      latency: isTimeout ? null : latency,
      statusCode: err?.response?.status ?? err?.status ?? null,
      error: err?.message ?? String(err),
    })
    console.warn(`[monitor] Check FAILED — ${isTimeout ? 'timeout' : err?.message}`)
  } finally {
    clearTimeout(timeoutId)
    isRunning = false
  }
}

export default defineNitroPlugin((nitro) => {
  const config = useRuntimeConfig()
  const apiKey = config.ananapiKey as string

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
  nitro.hooks.hook('close', async () => {
    console.log('[monitor] Shutting down...')
    await monitorTask?.stop()
    await cleanupTask?.stop()
    closeDb()
  })
})
