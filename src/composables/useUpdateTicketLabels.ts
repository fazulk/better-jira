import type { JiraTicket } from '@/types/jira'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketLabels } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import { getCachedTickets, getCachedTicketsQueryKey } from '@/composables/useJiraTickets'

function mergeTicketList(tickets: JiraTicket[], updatedTicket: JiraTicket): JiraTicket[] {
  return tickets.map((ticket) => {
    if (ticket.key === updatedTicket.key) {
      return {
        ...ticket,
        ...updatedTicket,
      }
    }

    if (ticket.parent?.key === updatedTicket.key) {
      return {
        ...ticket,
        parent: {
          ...ticket.parent,
          summary: updatedTicket.summary,
          issueType: updatedTicket.issueType,
        },
      }
    }

    return ticket
  })
}

export function useUpdateTicketLabels() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, labels }: { key: string, labels: string[] }) => updateTicketLabels(key, labels),
    onSuccess: (updatedTicket) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)
      const existingTickets = getCachedTickets(queryClient) ?? []
      queryClient.setQueryData(ticketsQueryKey, mergeTicketList(existingTickets, updatedTicket))
      queryClient.setQueryData(ticketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
