import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchAllPriorities } from '@/api/jira'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export const prioritiesQueryKey = ['priorities'] as const

export function usePriorities(queryEnabled?: Ref<boolean>) {
  return useQuery({
    queryKey: prioritiesQueryKey,
    queryFn: fetchAllPriorities,
    enabled: computed(() => queryEnabled === undefined || queryEnabled.value),
    staleTime: THIRTY_DAYS_MS,
    gcTime: THIRTY_DAYS_MS,
  })
}
