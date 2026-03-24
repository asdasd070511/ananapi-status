<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const props = defineProps<{
  status: 'operational' | 'degraded' | 'down' | null
  latency: number | null
  uptime24h: number
  lastCheck: number | null
}>()

const statusDot = computed(() => {
  switch (props.status) {
    case 'operational': return 'bg-emerald-500'
    case 'degraded': return 'bg-amber-500'
    case 'down': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
})

const lastCheckFormatted = computed(() => {
  if (!props.lastCheck) return '---'
  return formatDistanceToNow(props.lastCheck, { addSuffix: true, locale: zhTW })
})
</script>

<template>
  <div class="status-card">
    <div class="card-header">
      <span :class="statusDot" class="dot" />
      <span class="endpoint-name">OpenAI API (gpt-5.4)</span>
    </div>
    <div class="card-metrics">
      <div class="metric">
        <span class="metric-label">回應時間</span>
        <span class="metric-value">{{ latency !== null ? `${latency}ms` : '---' }}</span>
      </div>
      <div class="metric">
        <span class="metric-label">24h Uptime</span>
        <span class="metric-value">{{ uptime24h }}%</span>
      </div>
      <div class="metric">
        <span class="metric-label">最後檢查</span>
        <span class="metric-value">{{ lastCheckFormatted }}</span>
      </div>
    </div>
  </div>
</template>
