import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchTicketGithubPrLink } from '@/api/jira'

export const ticketGithubPrLinkQueryKey = (ticketKey: string | null) => ['ticket-github-pr-link', ticketKey] as const

export function useTicketGithubPrLink(ticketKey: Ref<string | null>) {
  return useQuery({
    queryKey: computed(() => ticketGithubPrLinkQueryKey(ticketKey.value)),
    queryFn: async () => {
      const key = ticketKey.value
      if (!key) {
        throw new Error('Ticket key is required.')
      }

      return fetchTicketGithubPrLink(key)
    },
    enabled: computed(() => !!ticketKey.value),
  })
}
