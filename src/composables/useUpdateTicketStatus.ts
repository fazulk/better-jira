import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketStatus } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import { getCachedTickets, getCachedTicketsQueryKey, TICKETS_QUERY_KEY } from '@/composables/useJiraTickets'
import { transitionsQueryKey } from '@/composables/useTransitions'
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

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, transitionId }: { key: string; transitionId: string; statusName: string; statusCategory: string }) =>
      updateTicketStatus(key, transitionId),
    onMutate: async ({ key, statusName, statusCategory }) => {
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
            status: statusName,
            statusCategory,
          }),
        )
      }

      if (previousTicket) {
        queryClient.setQueryData<JiraTicket>(ticketQueryKey(key), {
          ...previousTicket,
          status: statusName,
          statusCategory,
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
      // Invalidate transitions since available transitions change with status
      queryClient.invalidateQueries({ queryKey: transitionsQueryKey(updatedTicket.key) })
    },
  })
}
