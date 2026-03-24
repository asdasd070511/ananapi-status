<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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

const ranges = ['24h', '7d', '30d']

const timeFormat = computed(() => {
  switch (props.range) {
    case '24h': return 'HH:mm'
    case '7d': return 'MM/dd HH:mm'
    case '30d': return 'MM/dd'
    default: return 'HH:mm'
  }
})

const chartData = computed(() => ({
  labels: props.data.map((d) => format(d.timestamp, timeFormat.value)),
  datasets: [
    {
      label: '回應時間 (ms)',
      data: props.data.map((d) => d.avgLatency),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      pointBackgroundColor: props.data.map((d) =>
        d.failureCount > 0 ? '#ef4444' : '#10b981'
      ),
      pointRadius: props.data.map((d) => (d.failureCount > 0 ? 5 : 2)),
      fill: true,
      tension: 0.3,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `${ctx.parsed.y ?? 'N/A'} ms`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: 'ms' },
    },
  },
}))
</script>

<template>
  <div class="latency-chart">
    <div class="chart-header">
      <h2>回應時間</h2>
      <div class="range-toggle">
        <button
          v-for="r in ranges"
          :key="r"
          :class="{ active: range === r }"
          @click="emit('update:range', r)"
        >
          {{ r }}
        </button>
      </div>
    </div>
    <div class="chart-container">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
