export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    ananapiKey: '',
    ananapiBaseUrl: 'https://www.ananapi.com',
    ananapiModel: 'gpt-5.4',
  },
})
