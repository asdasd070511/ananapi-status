<script setup lang="ts">
import { useStatusPolling } from '~/composables/useStatusPolling'

interface StatusData {
  status: 'operational' | 'degraded' | 'down'
  latency: number | null
  statusCode: number | null
  uptime24h: number
  lastCheck: number | null
  recentChecks: number
  recentFailures: number
}

interface CheckDataPoint {
  timestamp: number
  avgLatency: number | null
  maxLatency: number | null
  totalChecks: number
  successCount: number
  failureCount: number
  uptime: number
}

interface ChecksData {
  range: string
  data: CheckDataPoint[]
}

interface Incident {
  startTime: number
  endTime: number
  failureCount: number
  error: string | null
}

interface IncidentsData {
  incidents: Incident[]
}

const selectedRange = ref('24h')

const { data: statusData } = useStatusPolling<StatusData>('/api/status')

const { data: checksData } = useStatusPolling<ChecksData>(
  () => `/api/checks?range=${selectedRange.value}`,
)

const { data: incidentsData } = useStatusPolling<IncidentsData>('/api/incidents')

useHead({
  title: 'Ananapi Status',
  meta: [
    { name: 'description', content: 'Ananapi API 即時運行狀態與可用性監測' },
  ],
  htmlAttrs: {
    lang: 'zh-TW',
    class: 'dark',
  },
  bodyAttrs: {
    class: 'bg-slate-950 text-slate-50 antialiased',
  },
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-50">
    <StatusHeader :status="statusData?.status ?? null" />

    <main class="mx-auto max-w-3xl space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <StatusCard
        :status="statusData?.status ?? null"
        :latency="statusData?.latency ?? null"
        :uptime24h="statusData?.uptime24h ?? 100"
        :last-check="statusData?.lastCheck ?? null"
      />

      <ClientOnly>
        <LatencyChart
          :data="checksData?.data ?? []"
          :range="selectedRange"
          @update:range="selectedRange = $event"
        />
        <template #fallback>
          <div class="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div class="mb-4 flex items-center justify-between">
              <div class="h-6 w-24 animate-pulse rounded bg-slate-800" />
              <div class="flex gap-1">
                <div class="h-8 w-12 animate-pulse rounded-lg bg-slate-800" />
                <div class="h-8 w-12 animate-pulse rounded-lg bg-slate-800" />
                <div class="h-8 w-12 animate-pulse rounded-lg bg-slate-800" />
              </div>
            </div>
            <div class="h-64 animate-pulse rounded-lg bg-slate-800/50" />
          </div>
        </template>
      </ClientOnly>

      <IncidentTimeline
        :incidents="incidentsData?.incidents ?? []"
      />
    </main>

    <footer class="border-t border-slate-800/60 py-8">
      <p class="text-center text-sm text-slate-500">
        每 2 分鐘自動監測 · 頁面每 60 秒自動刷新
      </p>
    </footer>
  </div>
</template>
