import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateLocalTicketStatus } from '@/api/localTickets'
import { localTicketQueryKey } from '@/composables/useLocalTicket'
import { getCachedTickets, getCachedTicketsQueryKey } from '@/composables/useJiraTickets'
import { mergeLocalTicketList } from '@/composables/useLocalTickets'

export function useUpdateLocalTicketStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, transitionId }: { key: string; transitionId: string }) =>
      updateLocalTicketStatus(key, transitionId),
    onSuccess: (updatedTicket) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)
      const existingTickets = getCachedTickets(queryClient) ?? []
      queryClient.setQueryData(ticketsQueryKey, mergeLocalTicketList(existingTickets, updatedTicket))
      queryClient.setQueryData(localTicketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
