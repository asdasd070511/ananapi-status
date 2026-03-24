import { vi } from 'vitest'

// Stub Nuxt/Nitro auto-imports that are not available in the test environment
;(globalThis as any).defineEventHandler = (handler: unknown) => handler
;(globalThis as any).defineNitroPlugin = (plugin: unknown) => plugin
