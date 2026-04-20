import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchTransitions } from '@/api/jira'

export const transitionsQueryKey = (ticketKey: string | null) => ['ticket-transitions', ticketKey] as const

export function useTransitions(
  ticketKey: Ref<string | null>,
  options?: { queryEnabled?: Ref<boolean> },
) {
  return useQuery({
    queryKey: computed(() => transitionsQueryKey(ticketKey.value)),
    queryFn: ({ queryKey }) => {
      const [, key] = queryKey as ReturnType<typeof transitionsQueryKey>
      return fetchTransitions(key as string)
    },
    enabled: computed(() => {
      if (!ticketKey.value) return false
      if (options?.queryEnabled && !options.queryEnabled.value) return false
      return true
    }),
    staleTime: 20_000,
  })
}
