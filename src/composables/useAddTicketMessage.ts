import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { addTicketMessage } from '@/api/jira'
import { ticketMessagesQueryKey } from '@/composables/useJiraMessages'
import type { JiraMessage } from '@/types/jira'

export function useAddTicketMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: string }) => addTicketMessage(key, body),
    onSuccess: (message, { key }) => {
      queryClient.setQueryData<JiraMessage[]>(ticketMessagesQueryKey(key), (current = []) => [message, ...current])
    },
  })
}
