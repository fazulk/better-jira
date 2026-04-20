import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateLocalTicketPriority } from '@/api/localTickets'
import { localTicketQueryKey } from '@/composables/useLocalTicket'
import { getCachedTickets, getCachedTicketsQueryKey } from '@/composables/useJiraTickets'
import { mergeLocalTicketList } from '@/composables/useLocalTickets'

export function useUpdateLocalTicketPriority() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, priorityName }: { key: string; priorityName: string }) =>
      updateLocalTicketPriority(key, priorityName),
    onSuccess: (updatedTicket) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)
      const existingTickets = getCachedTickets(queryClient) ?? []
      queryClient.setQueryData(ticketsQueryKey, mergeLocalTicketList(existingTickets, updatedTicket))
      queryClient.setQueryData(localTicketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
