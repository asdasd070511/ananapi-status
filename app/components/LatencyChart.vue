<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { format } from 'date-fns'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface DataPoint {
  timestamp: number
  avgLatency: number | null
  failureCount: number
}

const props = defineProps<{
  data: DataPoint[]
  range: string
}>()

const emit = defineEmits<{
  'update:range': [value: string]
}>()

const ranges = ['24h', '7d', '30d'] as const

const rangeLabels: Record<string, string> = {
  '24h': '24 小時',
  '7d': '7 天',
  '30d': '30 天',
}

const timeFormat = computed(() => {
  switch (props.range) {
    case '24h': return 'HH:mm'
    case '7d': return 'MM/dd HH:mm'
    case '30d': return 'MM/dd'
    default: return 'HH:mm'
  }
})

const chartData = computed(() => ({
  labels: props.data.map(d => format(d.timestamp, timeFormat.value)),
  datasets: [
    {
      label: '回應時間 (ms)',
      data: props.data.map(d => d.avgLatency),
      borderColor: '#34d399',
      backgroundColor: 'rgba(52, 211, 153, 0.08)',
      pointBackgroundColor: props.data.map(d =>
        d.failureCount > 0 ? '#f87171' : '#34d399',
      ),
      pointBorderColor: props.data.map(d =>
        d.failureCount > 0 ? '#f87171' : '#34d399',
      ),
      pointRadius: props.data.map(d => (d.failureCount > 0 ? 5 : 2)),
      pointHoverRadius: 6,
      fill: true,
      tension: 0.3,
      borderWidth: 2,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    intersect: false,
    mode: 'index' as const,
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      padding: 12,
      cornerRadius: 8,
      displayColors: false,
      callbacks: {
        label: (ctx: any) => `${ctx.parsed.y ?? 'N/A'} ms`,
      },
    },
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(51, 65, 85, 0.3)',
        drawBorder: false,
      },
      ticks: {
        color: '#64748b',
        maxRotation: 0,
        autoSkipPadding: 20,
        font: { size: 11 },
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(51, 65, 85, 0.3)',
        drawBorder: false,
      },
      ticks: {
        color: '#64748b',
        font: { size: 11 },
      },
      title: {
        display: true,
        text: 'ms',
        color: '#64748b',
        font: { size: 12 },
      },
    },
  },
}))
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-black/20 transition-shadow duration-300 hover:shadow-xl hover:shadow-black/30 sm:p-6">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-base font-medium text-slate-100">
        回應時間
      </h2>
      <div class="flex gap-1 rounded-lg bg-slate-800/70 p-1" role="radiogroup" aria-label="時間範圍">
        <button
          v-for="r in ranges"
          :key="r"
          :class="[
            range === r
              ? 'bg-slate-700 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-300',
          ]"
          class="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200"
          role="radio"
          :aria-checked="range === r"
          :aria-label="rangeLabels[r]"
          @click="emit('update:range', r)"
        >
          {{ r }}
        </button>
      </div>
    </div>
    <div class="h-64 sm:h-72">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
