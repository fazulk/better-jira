import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateLocalTicketTitle } from '@/api/localTickets'
import { localTicketQueryKey } from '@/composables/useLocalTicket'
import {
  getCachedTickets,
  getCachedTicketsQueryKey,
  TICKETS_QUERY_KEY,
} from '@/composables/useJiraTickets'
import { mergeLocalTicketList } from '@/composables/useLocalTickets'
import type { JiraTicket } from '@/types/jira'

export function useUpdateLocalTicketTitle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, title }: { key: string; title: string }) => updateLocalTicketTitle(key, title),
    onMutate: async ({ key, title }) => {
      const nextSummary = title.trim()
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)

      await queryClient.cancelQueries({ queryKey: TICKETS_QUERY_KEY })
      await queryClient.cancelQueries({ queryKey: localTicketQueryKey(key) })

      const previousTickets = getCachedTickets(queryClient)
      const previousTicket = queryClient.getQueryData<JiraTicket>(localTicketQueryKey(key))
      const optimisticBaseTicket = previousTicket ?? previousTickets?.find((ticket) => ticket.key === key)

      if (previousTickets && optimisticBaseTicket) {
        queryClient.setQueryData<JiraTicket[]>(
          ticketsQueryKey,
          mergeLocalTicketList(previousTickets, {
            ...optimisticBaseTicket,
            summary: nextSummary,
          }),
        )
      }

      if (previousTicket) {
        queryClient.setQueryData<JiraTicket>(localTicketQueryKey(key), {
          ...previousTicket,
          summary: nextSummary,
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
        queryClient.setQueryData(localTicketQueryKey(context.key), context.previousTicket)
      }
    },
    onSuccess: (updatedTicket) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)
      const existingTickets = getCachedTickets(queryClient) ?? []
      queryClient.setQueryData(ticketsQueryKey, mergeLocalTicketList(existingTickets, updatedTicket))
      queryClient.setQueryData(localTicketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
