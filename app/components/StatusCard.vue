<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const props = defineProps<{
  status: 'operational' | 'degraded' | 'down' | null
  latency: number | null
  uptime24h: number
  lastCheck: number | null
}>()

const statusConfig = computed(() => {
  switch (props.status) {
    case 'operational':
      return { dot: 'bg-emerald-400', ring: 'ring-emerald-400/30' }
    case 'degraded':
      return { dot: 'bg-amber-400', ring: 'ring-amber-400/30' }
    case 'down':
      return { dot: 'bg-red-400', ring: 'ring-red-400/30' }
    default:
      return { dot: 'bg-slate-500', ring: 'ring-slate-500/30' }
  }
})

const uptimeColor = computed(() => {
  if (props.uptime24h >= 99.9) return 'text-emerald-400'
  if (props.uptime24h >= 99) return 'text-amber-400'
  return 'text-red-400'
})

const latencyColor = computed(() => {
  if (props.latency === null) return 'text-slate-400'
  if (props.latency < 500) return 'text-emerald-400'
  if (props.latency < 2000) return 'text-amber-400'
  return 'text-red-400'
})

const lastCheckFormatted = computed(() => {
  if (!props.lastCheck) return '---'
  return formatDistanceToNow(props.lastCheck, { addSuffix: true, locale: zhTW })
})
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-black/20 transition-shadow duration-300 hover:shadow-xl hover:shadow-black/30 sm:p-6">
    <div class="mb-5 flex items-center gap-3">
      <span
        :class="[statusConfig.dot, statusConfig.ring]"
        class="h-3 w-3 rounded-full ring-4 transition-colors duration-500"
      />
      <span class="text-base font-medium text-slate-100">
        OpenAI API (gpt-5.4)
      </span>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="rounded-lg bg-slate-800/50 px-3 py-3 sm:px-4">
        <p class="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          回應時間
        </p>
        <p :class="latencyColor" class="text-lg font-semibold tabular-nums transition-colors duration-300 sm:text-xl">
          {{ latency !== null ? `${latency}ms` : '---' }}
        </p>
      </div>

      <div class="rounded-lg bg-slate-800/50 px-3 py-3 sm:px-4">
        <p class="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          24h Uptime
        </p>
        <p :class="uptimeColor" class="text-lg font-semibold tabular-nums transition-colors duration-300 sm:text-xl">
          {{ uptime24h.toFixed(1) }}%
        </p>
      </div>

      <div class="rounded-lg bg-slate-800/50 px-3 py-3 sm:px-4">
        <p class="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          最後檢查
        </p>
        <p class="text-lg font-semibold text-slate-200 transition-colors duration-300 sm:text-xl">
          {{ lastCheckFormatted }}
        </p>
      </div>
    </div>
  </div>
</template>
