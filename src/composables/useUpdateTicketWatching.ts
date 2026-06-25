import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketWatching } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import { getCachedTickets, getCachedTicketsQueryKey, TICKETS_QUERY_KEY } from '@/composables/useJiraTickets'
import type { JiraTicket } from '@/types/jira'

function getOptimisticWatchCount(ticket: JiraTicket, watching: boolean): number | undefined {
  if (typeof ticket.watchCount !== 'number') return undefined

  if (watching && ticket.isWatching !== true) {
    return ticket.watchCount + 1
  }

  if (!watching && ticket.isWatching === true) {
    return Math.max(0, ticket.watchCount - 1)
  }

  return ticket.watchCount
}

function withWatchState(ticket: JiraTicket, watching: boolean): JiraTicket {
  const watchCount = getOptimisticWatchCount(ticket, watching)

  return {
    ...ticket,
    isWatching: watching,
    ...(typeof watchCount === 'number' ? { watchCount } : {}),
  }
}

function mergeTicket(tickets: JiraTicket[], updatedTicket: JiraTicket): JiraTicket[] {
  return tickets.map((ticket) => {
    if (ticket.key === updatedTicket.key) {
      return {
        ...ticket,
        ...updatedTicket,
      }
    }

    return ticket
  })
}

export function useUpdateTicketWatching() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, watching }: { key: string; watching: boolean }) => updateTicketWatching(key, watching),
    onMutate: async ({ key, watching }) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)

      await queryClient.cancelQueries({ queryKey: TICKETS_QUERY_KEY })
      await queryClient.cancelQueries({ queryKey: ticketQueryKey(key) })

      const previousTickets = getCachedTickets(queryClient)
      const previousTicket = queryClient.getQueryData<JiraTicket>(ticketQueryKey(key))
      const optimisticBaseTicket = previousTicket ?? previousTickets?.find((ticket) => ticket.key === key)

      if (previousTickets && optimisticBaseTicket) {
        queryClient.setQueryData<JiraTicket[]>(
          ticketsQueryKey,
          mergeTicket(previousTickets, withWatchState(optimisticBaseTicket, watching)),
        )
      }

      if (previousTicket) {
        queryClient.setQueryData<JiraTicket>(ticketQueryKey(key), withWatchState(previousTicket, watching))
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
