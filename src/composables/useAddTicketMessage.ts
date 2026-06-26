import type { JiraMessage } from '@/types/jira'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { addTicketMessage } from '@/api/jira'
import { ticketActivityQueryKey, ticketMessagesQueryKey } from '@/composables/useJiraMessages'

export function useAddTicketMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, body }: { key: string, body: string }) => addTicketMessage(key, body),
    onSuccess: (message, { key }) => {
      queryClient.setQueryData<JiraMessage[]>(ticketMessagesQueryKey(key), (current = []) => [message, ...current])
      void queryClient.invalidateQueries({ queryKey: ticketActivityQueryKey(key) })
    },
  })
}
