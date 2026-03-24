export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  runtimeConfig: {
    ananapiKey: process.env.ANANAPI_KEY || '',
  },
})
