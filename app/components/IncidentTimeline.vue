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
  <div class="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-black/20 transition-shadow duration-300 hover:shadow-xl hover:shadow-black/30 sm:p-6">
    <h2 class="mb-5 text-base font-medium text-slate-100">
      歷史事件
    </h2>

    <div
      v-if="incidents.length === 0"
      class="flex items-center gap-3 rounded-lg bg-emerald-500/5 px-4 py-4 text-sm text-emerald-400"
    >
      <span class="flex h-2 w-2">
        <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      近期無異常事件
    </div>

    <div v-else class="relative space-y-0">
      <!-- Vertical timeline line -->
      <div class="absolute bottom-2 left-[7px] top-2 w-px bg-slate-700/60" aria-hidden="true" />

      <div
        v-for="(incident, i) in incidents"
        :key="i"
        class="group relative flex gap-4 py-3"
      >
        <!-- Timeline dot -->
        <div class="relative z-10 mt-1.5 flex-shrink-0">
          <div class="h-3.5 w-3.5 rounded-full border-2 border-red-400/60 bg-red-500/20 transition-colors duration-200 group-hover:border-red-400 group-hover:bg-red-500/30" />
        </div>

        <!-- Content -->
        <div class="min-w-0 flex-1 pb-1">
          <div class="mb-1 text-sm font-medium text-slate-200">
            {{ format(incident.startTime, 'MM/dd HH:mm') }}
            <span v-if="incident.startTime !== incident.endTime" class="text-slate-500">
              — {{ format(incident.endTime, 'HH:mm') }}
            </span>
          </div>
          <div class="text-xs text-slate-500">
            持續 {{ formatIncidentDuration(incident.startTime, incident.endTime) }}
            · {{ incident.failureCount }} 次失敗
          </div>
          <div
            v-if="incident.error"
            class="mt-2 rounded-md bg-red-500/5 px-3 py-2 font-mono text-xs text-red-400/80"
          >
            {{ incident.error }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
