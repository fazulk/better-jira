import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketStatus } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import { transitionsQueryKey } from '@/composables/useTransitions'
import type { JiraTicket } from '@/types/jira'

const TICKETS_QUERY_KEY = ['tickets'] as const

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
      await queryClient.cancelQueries({ queryKey: TICKETS_QUERY_KEY })
      await queryClient.cancelQueries({ queryKey: ticketQueryKey(key) })

      const previousTickets = queryClient.getQueryData<JiraTicket[]>(TICKETS_QUERY_KEY)
      const previousTicket = queryClient.getQueryData<JiraTicket>(ticketQueryKey(key))
      const optimisticBaseTicket = previousTicket ?? previousTickets?.find((ticket) => ticket.key === key)

      if (previousTickets && optimisticBaseTicket) {
        queryClient.setQueryData<JiraTicket[]>(
          TICKETS_QUERY_KEY,
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

      return { previousTickets, previousTicket, key }
    },
    onError: (_err, _variables, context) => {
      if (!context) return
      if (context.previousTickets) {
        queryClient.setQueryData(TICKETS_QUERY_KEY, context.previousTickets)
      }
      if (context.previousTicket) {
        queryClient.setQueryData(ticketQueryKey(context.key), context.previousTicket)
      }
    },
    onSuccess: (updatedTicket) => {
      const existingTickets = queryClient.getQueryData<JiraTicket[]>(TICKETS_QUERY_KEY) ?? []
      queryClient.setQueryData(TICKETS_QUERY_KEY, mergeTicket(existingTickets, updatedTicket))
      queryClient.setQueryData(ticketQueryKey(updatedTicket.key), updatedTicket)
      // Invalidate transitions since available transitions change with status
      queryClient.invalidateQueries({ queryKey: transitionsQueryKey(updatedTicket.key) })
    },
  })
}
