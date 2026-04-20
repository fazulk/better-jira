import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateLocalTicketDescription } from '@/api/localTickets'
import { localTicketQueryKey } from '@/composables/useLocalTicket'
import { getCachedTickets, getCachedTicketsQueryKey } from '@/composables/useJiraTickets'
import { mergeLocalTicketList } from '@/composables/useLocalTickets'
import type { JiraAdfDocument } from '@/types/jira'

export function useUpdateLocalTicketDescription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, descriptionAdf }: { key: string; descriptionAdf: JiraAdfDocument | null }) =>
      updateLocalTicketDescription(key, descriptionAdf),
    onSuccess: (updatedTicket) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)
      const existingTickets = getCachedTickets(queryClient) ?? []
      queryClient.setQueryData(ticketsQueryKey, mergeLocalTicketList(existingTickets, updatedTicket))
      queryClient.setQueryData(localTicketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
