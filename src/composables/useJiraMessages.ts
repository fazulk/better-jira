import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchTicketMessages } from '@/api/jira'

export const ticketMessagesQueryKey = (ticketKey: string | null) => ['ticket-messages', ticketKey] as const

export function useJiraMessages(
  ticketKey: Ref<string | null>,
  options?: { queryEnabled?: Ref<boolean> },
) {
  return useQuery({
    queryKey: computed(() => ticketMessagesQueryKey(ticketKey.value)),
    queryFn: ({ queryKey }) => {
      const [, key] = queryKey
      if (!key) throw new Error('Ticket key is required')
      return fetchTicketMessages(key)
    },
    enabled: computed(() => {
      if (!ticketKey.value) return false
      if (options?.queryEnabled && !options.queryEnabled.value) return false
      return true
    }),
  })
}
