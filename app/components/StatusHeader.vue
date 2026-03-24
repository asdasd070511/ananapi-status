<script setup lang="ts">
const props = defineProps<{
  status: 'operational' | 'degraded' | 'down' | null
}>()

const statusConfig = computed(() => {
  switch (props.status) {
    case 'operational':
      return { label: '所有系統正常運作', color: 'bg-emerald-500', textColor: 'text-emerald-500' }
    case 'degraded':
      return { label: '回應緩慢', color: 'bg-amber-500', textColor: 'text-amber-500' }
    case 'down':
      return { label: '服務異常', color: 'bg-red-500', textColor: 'text-red-500' }
    default:
      return { label: '載入中...', color: 'bg-gray-400', textColor: 'text-gray-400' }
  }
})
</script>

<template>
  <header>
    <h1>Ananapi Status</h1>
    <div :class="statusConfig.color" class="status-banner">
      <span class="status-dot" />
      <span>{{ statusConfig.label }}</span>
    </div>
  </header>
</template>
