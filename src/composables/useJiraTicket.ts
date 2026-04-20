import { computed, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { fetchTicket } from '@/api/jira'
import { getCachedTickets } from '@/composables/useJiraTickets'
import type { JiraTicket } from '@/types/jira'

export const ticketQueryKey = (ticketKey: string | null) => ['ticket', ticketKey] as const

export function useJiraTicket(
  ticketKey: Ref<string | null>,
  options?: { queryEnabled?: Ref<boolean> },
) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: computed(() => ticketQueryKey(ticketKey.value)),
    queryFn: ({ queryKey }) => {
      const [, key] = queryKey as ReturnType<typeof ticketQueryKey>
      return fetchTicket(key as string)
    },
    enabled: computed(() => {
      if (!ticketKey.value) return false
      if (options?.queryEnabled && !options.queryEnabled.value) return false
      return true
    }),
    initialData: () => {
      const key = ticketKey.value
      if (!key) return undefined

      const tickets = getCachedTickets(queryClient)
      return tickets?.find((ticket) => ticket.key === key)
    },
  })
}
