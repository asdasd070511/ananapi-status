import { getDb, closeDb, insertCheck, deleteOldChecks } from '../utils/db'
import { useRuntimeConfig } from '#imports'

let isRunning = false
let monitorTimer: ReturnType<typeof setInterval> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null

async function performHealthCheck(apiKey: string, baseUrl: string, model: string): Promise<void> {
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
    const response = await $fetch.raw(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model,
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
  const baseUrl = config.ananapiBaseUrl as string
  const model = config.ananapiModel as string

  if (!apiKey) {
    console.warn('[monitor] ANANAPI_KEY not set — monitoring disabled')
    return
  }

  // Initialize DB on startup
  getDb()
  console.log('[monitor] Database initialized')

  // Health check every 2 minutes (120000ms)
  monitorTimer = setInterval(() => {
    performHealthCheck(apiKey, baseUrl, model)
  }, 2 * 60 * 1000)

  // Run first check immediately
  performHealthCheck(apiKey, baseUrl, model)

  // Cleanup old data every hour (3600000ms)
  cleanupTimer = setInterval(() => {
    const db = getDb()
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const deleted = deleteOldChecks(db, thirtyDaysAgo)
    if (deleted > 0) {
      console.log(`[monitor] Cleaned up ${deleted} old records`)
    }
  }, 60 * 60 * 1000)

  console.log('[monitor] Started — checking every 2 minutes')

  // Graceful shutdown
  nitro.hooks.hook('close', () => {
    console.log('[monitor] Shutting down...')
    if (monitorTimer) clearInterval(monitorTimer)
    if (cleanupTimer) clearInterval(cleanupTimer)
    closeDb()
  })
})
