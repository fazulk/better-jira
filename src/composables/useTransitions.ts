import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchTransitions } from '@/api/jira'

export const transitionsQueryKey = (ticketKey: string | null) => ['ticket-transitions', ticketKey] as const

export function useTransitions(ticketKey: Ref<string | null>) {
  return useQuery({
    queryKey: computed(() => transitionsQueryKey(ticketKey.value)),
    queryFn: ({ queryKey }) => {
      const [, key] = queryKey as ReturnType<typeof transitionsQueryKey>
      return fetchTransitions(key as string)
    },
    enabled: computed(() => !!ticketKey.value),
    staleTime: 20_000,
  })
}
