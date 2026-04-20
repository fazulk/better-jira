import { computed, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { fetchAvailableSpaces } from '@/api/settings'
import type { JiraSpaceDirectoryEntry } from '~/shared/settings'

export const jiraSpaceDirectoryQueryKey = ['jira-space-directory'] as const

const AVAILABLE_SPACES_BOOTSTRAP_COMPLETE_KEY = 'available-spaces-bootstrap-complete'
const AVAILABLE_SPACES_BOOTSTRAP_PENDING_KEY = 'available-spaces-bootstrap-pending'

function getBootstrapCompleteState() {
  return useState<boolean>(AVAILABLE_SPACES_BOOTSTRAP_COMPLETE_KEY, () => false)
}

function getBootstrapPendingState() {
  return useState<boolean>(AVAILABLE_SPACES_BOOTSTRAP_PENDING_KEY, () => false)
}

async function fetchAndCacheAvailableSpaces(queryClient: ReturnType<typeof useQueryClient>): Promise<JiraSpaceDirectoryEntry[]> {
  return queryClient.fetchQuery({
    queryKey: jiraSpaceDirectoryQueryKey,
    queryFn: fetchAvailableSpaces,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
}

export function resetAvailableSpacesBootstrap(): void {
  getBootstrapCompleteState().value = false
  getBootstrapPendingState().value = false
}

export function useAvailableSpaces(enabled: Ref<boolean>) {
  const queryClient = useQueryClient()
  const bootstrapComplete = getBootstrapCompleteState()
  const bootstrapPending = getBootstrapPendingState()

  const query = useQuery({
    queryKey: jiraSpaceDirectoryQueryKey,
    queryFn: fetchAvailableSpaces,
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const hasCachedSpaces = computed(() => Array.isArray(query.data.value))

  async function ensureAvailableSpacesLoaded(): Promise<void> {
    if (!enabled.value || bootstrapComplete.value || bootstrapPending.value) {
      return
    }

    bootstrapPending.value = true

    try {
      await fetchAndCacheAvailableSpaces(queryClient)
      bootstrapComplete.value = true
    } finally {
      bootstrapPending.value = false
    }
  }

  async function refreshAvailableSpaces(): Promise<JiraSpaceDirectoryEntry[]> {
    bootstrapPending.value = true

    try {
      const spaces = await fetchAndCacheAvailableSpaces(queryClient)
      bootstrapComplete.value = true
      return spaces
    } finally {
      bootstrapPending.value = false
    }
  }

  return {
    query,
    availableSpaces: computed(() => query.data.value ?? []),
    errorMessage: computed(() => {
      const error = query.error.value
      return error instanceof Error ? error.message : null
    }),
    isLoading: computed(() => bootstrapPending.value && !hasCachedSpaces.value),
    isRefreshing: computed(() => bootstrapPending.value && hasCachedSpaces.value),
    ensureAvailableSpacesLoaded,
    refreshAvailableSpaces,
  }
}
