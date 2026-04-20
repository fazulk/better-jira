import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketDescription } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import { getCachedTickets, getCachedTicketsQueryKey, TICKETS_QUERY_KEY } from '@/composables/useJiraTickets'
import type { JiraAdfDocument, JiraTicket } from '@/types/jira'
import { adfToPlainText } from '~/shared/jiraAdf'

export function useUpdateTicketDescription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, descriptionAdf }: { key: string; descriptionAdf: JiraAdfDocument | null }) =>
      updateTicketDescription(key, descriptionAdf),
    onMutate: async ({ key, descriptionAdf }) => {
      const ticketsQueryKey = getCachedTicketsQueryKey(queryClient)

      await queryClient.cancelQueries({ queryKey: TICKETS_QUERY_KEY })
      await queryClient.cancelQueries({ queryKey: ticketQueryKey(key) })

      const previousTickets = getCachedTickets(queryClient)
      const previousTicket = queryClient.getQueryData<JiraTicket>(ticketQueryKey(key))
      const description = adfToPlainText(descriptionAdf)

      if (previousTicket) {
        queryClient.setQueryData<JiraTicket>(ticketQueryKey(key), {
          ...previousTicket,
          descriptionAdf: descriptionAdf ?? undefined,
          description,
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
      queryClient.setQueryData(ticketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
