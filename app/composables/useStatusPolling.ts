import { ref, watch, toValue, onMounted, onUnmounted, type MaybeRefOrGetter, type Ref } from 'vue'

export function useStatusPolling<T>(url: MaybeRefOrGetter<string>, intervalMs = 60000) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<Error | null>(null)
  const loading = ref(true)
  let timer: ReturnType<typeof setInterval> | null = null

  async function fetchData() {
    try {
      data.value = await $fetch<T>(toValue(url))
      error.value = null
    } catch (err: any) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  function startPolling() {
    stopPolling()
    timer = setInterval(fetchData, intervalMs)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function handleVisibility() {
    if (document.hidden) {
      stopPolling()
    } else {
      fetchData()
      startPolling()
    }
  }

  // Re-fetch when URL changes (reactive)
  watch(() => toValue(url), () => {
    fetchData()
  })

  onMounted(() => {
    fetchData()
    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)
  })

  onUnmounted(() => {
    stopPolling()
    document.removeEventListener('visibilitychange', handleVisibility)
  })

  return { data, error, loading, refresh: fetchData }
}
