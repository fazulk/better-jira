import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateLocalTicketLabels } from '@/api/localTickets'
import { getCachedTickets, getCachedTicketsQueryKey } from '@/composables/useJiraTickets'
import { localTicketQueryKey } from '@/composables/useLocalTicket'
import { mergeLocalTicketList } from '@/composables/useLocalTickets'

export function useUpdateLocalTicketLabels() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, labels }: { key: string, labels: string[] }) => updateLocalTicketLabels(key, labels),
    onSuccess: (updatedTicket) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)
      const existingTickets = getCachedTickets(queryClient) ?? []
      queryClient.setQueryData(ticketsQueryKey, mergeLocalTicketList(existingTickets, updatedTicket))
      queryClient.setQueryData(localTicketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
