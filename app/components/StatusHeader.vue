<script setup lang="ts">
const props = defineProps<{
  status: 'operational' | 'degraded' | 'down' | null
}>()

const statusConfig = computed(() => {
  switch (props.status) {
    case 'operational':
      return {
        label: '所有系統正常運作',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        text: 'text-emerald-400',
        dot: 'bg-emerald-400',
        glow: 'shadow-emerald-500/20',
      }
    case 'degraded':
      return {
        label: '回應緩慢',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        text: 'text-amber-400',
        dot: 'bg-amber-400',
        glow: 'shadow-amber-500/20',
      }
    case 'down':
      return {
        label: '服務異常',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        text: 'text-red-400',
        dot: 'bg-red-400',
        glow: 'shadow-red-500/20',
      }
    default:
      return {
        label: '載入中...',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/20',
        text: 'text-slate-400',
        dot: 'bg-slate-400',
        glow: '',
      }
  }
})
</script>

<template>
  <header class="border-b border-slate-800/60 bg-slate-950">
    <div class="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 class="mb-4 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
        Ananapi Status
      </h1>
      <div
        :class="[
          statusConfig.bg,
          statusConfig.border,
          statusConfig.glow,
        ]"
        class="inline-flex items-center gap-2.5 rounded-full border px-4 py-2 shadow-sm transition-all duration-500"
        role="status"
        :aria-label="`系統狀態: ${statusConfig.label}`"
      >
        <span class="relative flex h-2.5 w-2.5">
          <span
            v-if="status === 'operational' || status === 'down'"
            :class="statusConfig.dot"
            class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
          />
          <span
            :class="statusConfig.dot"
            class="relative inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-500"
          />
        </span>
        <span
          :class="statusConfig.text"
          class="text-sm font-medium transition-colors duration-500"
        >
          {{ statusConfig.label }}
        </span>
      </div>
    </div>
  </header>
</template>
