import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketDescription } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import type { JiraTicket } from '@/types/jira'

const TICKETS_QUERY_KEY = ['tickets'] as const

export function useUpdateTicketDescription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, description }: { key: string; description: string }) =>
      updateTicketDescription(key, description),
    onMutate: async ({ key, description }) => {
      await queryClient.cancelQueries({ queryKey: TICKETS_QUERY_KEY })
      await queryClient.cancelQueries({ queryKey: ticketQueryKey(key) })

      const previousTickets = queryClient.getQueryData<JiraTicket[]>(TICKETS_QUERY_KEY)
      const previousTicket = queryClient.getQueryData<JiraTicket>(ticketQueryKey(key))

      if (previousTicket) {
        queryClient.setQueryData<JiraTicket>(ticketQueryKey(key), {
          ...previousTicket,
          description,
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
      queryClient.setQueryData(ticketQueryKey(updatedTicket.key), updatedTicket)
    },
  })
}
