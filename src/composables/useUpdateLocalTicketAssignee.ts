import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateLocalTicketAssignee } from '@/api/localTickets'
import { localTicketQueryKey } from '@/composables/useLocalTicket'
import { getCachedTickets, getCachedTicketsQueryKey } from '@/composables/useJiraTickets'
import { mergeLocalTicketList } from '@/composables/useLocalTickets'

export function useUpdateLocalTicketAssignee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, assigneeName }: { key: string; assigneeName: string | null }) =>
      updateLocalTicketAssignee(key, assigneeName),
    onSuccess: (updatedTicket) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)
      const existingTickets = getCachedTickets(queryClient) ?? []
      queryClient.setQueryData(ticketsQueryKey, mergeLocalTicketList(existingTickets, updatedTicket))
      queryClient.setQueryData(localTicketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
