import { computed, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { fetchLocalTicket } from '@/api/localTickets'
import { getCachedTickets } from '@/composables/useJiraTickets'
import type { JiraTicket } from '@/types/jira'
import { isLocalTicketKey } from '~/shared/localTickets'

export const localTicketQueryKey = (ticketKey: string | null) => ['local-ticket', ticketKey] as const

export function useLocalTicket(ticketKey: Ref<string | null>) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: computed(() => localTicketQueryKey(ticketKey.value)),
    queryFn: ({ queryKey }) => {
      const [, key] = queryKey as ReturnType<typeof localTicketQueryKey>
      return fetchLocalTicket(key as string)
    },
    enabled: computed(() => Boolean(ticketKey.value && isLocalTicketKey(ticketKey.value))),
    initialData: () => {
      const key = ticketKey.value
      if (!key) return undefined

      const tickets = getCachedTickets(queryClient)
      return tickets?.find((ticket) => ticket.key === key)
    },
  })
}
