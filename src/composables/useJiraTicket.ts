import { computed, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { fetchTicket } from '@/api/jira'
import type { JiraTicket } from '@/types/jira'

export const ticketQueryKey = (ticketKey: string | null) => ['ticket', ticketKey] as const

export function useJiraTicket(ticketKey: Ref<string | null>) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: computed(() => ticketQueryKey(ticketKey.value)),
    queryFn: ({ queryKey }) => {
      const [, key] = queryKey as ReturnType<typeof ticketQueryKey>
      return fetchTicket(key as string)
    },
    enabled: computed(() => !!ticketKey.value),
    initialData: () => {
      const key = ticketKey.value
      if (!key) return undefined

      const tickets = queryClient.getQueryData<JiraTicket[]>(['tickets'])
      return tickets?.find((ticket) => ticket.key === key)
    },
  })
}
