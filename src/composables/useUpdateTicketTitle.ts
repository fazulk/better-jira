import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketTitle } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
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

export function useUpdateTicketTitle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, title }: { key: string; title: string }) => updateTicketTitle(key, title),
    onMutate: async ({ key, title }) => {
      const nextSummary = title.trim()

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
            summary: nextSummary,
          }),
        )
      }

      if (previousTicket) {
        queryClient.setQueryData<JiraTicket>(ticketQueryKey(key), {
          ...previousTicket,
          summary: nextSummary,
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
    },
  })
}
