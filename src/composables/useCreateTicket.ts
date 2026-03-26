import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { createTicket } from '@/api/jira'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import type { CreateJiraTicketInput, JiraTicket } from '@/types/jira'

const TICKETS_QUERY_KEY = ['tickets'] as const

function mergeCreatedTicket(tickets: JiraTicket[], createdTicket: JiraTicket): JiraTicket[] {
  const existingIndex = tickets.findIndex((ticket) => ticket.key === createdTicket.key)
  if (existingIndex === -1) {
    return [...tickets, createdTicket]
  }

  return tickets.map((ticket) => (
    ticket.key === createdTicket.key
      ? {
          ...ticket,
          ...createdTicket,
        }
      : ticket
  ))
}

export function useCreateTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateJiraTicketInput) => createTicket(input),
    onSuccess: (createdTicket) => {
      const existingTickets = queryClient.getQueryData<JiraTicket[]>(TICKETS_QUERY_KEY) ?? []
      queryClient.setQueryData<JiraTicket[]>(TICKETS_QUERY_KEY, mergeCreatedTicket(existingTickets, createdTicket))
      queryClient.setQueryData(ticketQueryKey(createdTicket.key), createdTicket)
    },
  })
}
