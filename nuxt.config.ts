export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    ananapiKey: process.env.ANANAPI_KEY || '',
    ananapiBaseUrl: process.env.ANANAPI_BASE_URL || 'https://www.ananapi.com',
    ananapiModel: process.env.ANANAPI_MODEL || 'gpt-5.4',
  },
})
