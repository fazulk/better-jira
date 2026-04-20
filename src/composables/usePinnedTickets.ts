import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'

const PINNED_TICKETS_STORAGE_KEY = 'jira2.sidebar.pinnedTickets'

function normalizeStoredStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return typeof value === 'string' ? [value] : []
  }

  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))]
}

export function usePinnedTickets() {
  const storedPinnedKeys = useLocalStorage<string[] | string | null>(PINNED_TICKETS_STORAGE_KEY, [])

  const pinnedKeys = computed<string[]>({
    get: () => normalizeStoredStringList(storedPinnedKeys.value),
    set: (value) => {
      storedPinnedKeys.value = value
    },
  })

  const pinnedKeySet = computed(() => new Set(pinnedKeys.value))

  function isPinned(key: string): boolean {
    return pinnedKeySet.value.has(key)
  }

  function togglePinnedTicket(key: string) {
    pinnedKeys.value = isPinned(key)
      ? pinnedKeys.value.filter(current => current !== key)
      : [key, ...pinnedKeys.value]
  }

  return {
    pinnedKeys,
    pinnedKeySet,
    isPinned,
    togglePinnedTicket,
  }
}
