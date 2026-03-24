<script setup lang="ts">
import { format, formatDuration, intervalToDuration } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export interface Incident {
  startTime: number
  endTime: number
  failureCount: number
  error: string | null
}

const props = defineProps<{
  incidents: Incident[]
}>()

function formatIncidentDuration(start: number, end: number): string {
  if (start === end) return '單次'
  const duration = intervalToDuration({ start, end })
  return formatDuration(duration, { locale: zhTW }) || '< 1 分鐘'
}
</script>

<template>
  <div class="incident-timeline">
    <h2>歷史事件</h2>
    <div v-if="incidents.length === 0" class="no-incidents">
      近期無異常事件
    </div>
    <div v-for="(incident, i) in incidents" :key="i" class="incident">
      <div class="incident-dot" />
      <div class="incident-content">
        <div class="incident-time">
          {{ format(incident.startTime, 'MM/dd HH:mm') }}
          <span v-if="incident.startTime !== incident.endTime">
            — {{ format(incident.endTime, 'HH:mm') }}
          </span>
        </div>
        <div class="incident-details">
          持續 {{ formatIncidentDuration(incident.startTime, incident.endTime) }}
          · {{ incident.failureCount }} 次失敗
        </div>
        <div v-if="incident.error" class="incident-error">
          {{ incident.error }}
        </div>
      </div>
    </div>
  </div>
</template>
