import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketPriority } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import { getCachedTickets, getCachedTicketsQueryKey, TICKETS_QUERY_KEY } from '@/composables/useJiraTickets'
import type { JiraTicket } from '@/types/jira'

function mergeTicket(tickets: JiraTicket[], updatedTicket: JiraTicket) {
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

export function useUpdateTicketPriority() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, priorityId }: { key: string; priorityId: string; priorityName: string }) =>
      updateTicketPriority(key, priorityId),
    onMutate: async ({ key, priorityName }) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)

      await queryClient.cancelQueries({ queryKey: TICKETS_QUERY_KEY })
      await queryClient.cancelQueries({ queryKey: ticketQueryKey(key) })

      const previousTickets = getCachedTickets(queryClient)
      const previousTicket = queryClient.getQueryData<JiraTicket>(ticketQueryKey(key))
      const optimisticBaseTicket = previousTicket ?? previousTickets?.find((ticket) => ticket.key === key)

      if (previousTickets && optimisticBaseTicket) {
        queryClient.setQueryData<JiraTicket[]>(
          ticketsQueryKey,
          mergeTicket(previousTickets, {
            ...optimisticBaseTicket,
            priority: priorityName,
          }),
        )
      }

      if (previousTicket) {
        queryClient.setQueryData<JiraTicket>(ticketQueryKey(key), {
          ...previousTicket,
          priority: priorityName,
        })
      }

      return { previousTickets, previousTicket, key, ticketsQueryKey }
    },
    onError: (_err, _variables, context) => {
      if (!context) return
      if (context.previousTickets) {
        queryClient.setQueryData(context.ticketsQueryKey, context.previousTickets)
      }
      if (context.previousTicket) {
        queryClient.setQueryData(ticketQueryKey(context.key), context.previousTicket)
      }
    },
    onSuccess: (updatedTicket) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)
      const existingTickets = getCachedTickets(queryClient) ?? []
      queryClient.setQueryData(ticketsQueryKey, mergeTicket(existingTickets, updatedTicket))
      queryClient.setQueryData(ticketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
