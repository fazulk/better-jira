import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { updateTicketGithubPrLink } from '@/api/jira'
import { ticketGithubPrLinkQueryKey } from '@/composables/useTicketGithubPrLink'
import type { TicketGithubPrLink } from '~/shared/ticketLinks'

interface UpdateTicketGithubPrLinkMutationInput {
  key: string
  githubPrUrl: string | null
}

export function useUpdateTicketGithubPrLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, githubPrUrl }: UpdateTicketGithubPrLinkMutationInput) =>
      updateTicketGithubPrLink(key, githubPrUrl),
    onMutate: async ({ key, githubPrUrl }) => {
      const queryKey = ticketGithubPrLinkQueryKey(key)

      await queryClient.cancelQueries({ queryKey })

      const previousLink = queryClient.getQueryData<TicketGithubPrLink>(queryKey)
      queryClient.setQueryData<TicketGithubPrLink>(queryKey, {
        ticketKey: key,
        githubPrUrl,
      })

      return { previousLink, queryKey }
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return
      }

      if (context.previousLink) {
        queryClient.setQueryData(context.queryKey, context.previousLink)
        return
      }

      queryClient.removeQueries({ queryKey: context.queryKey, exact: true })
    },
    onSuccess: (githubPrLink) => {
      queryClient.setQueryData(
        ticketGithubPrLinkQueryKey(githubPrLink.ticketKey),
        githubPrLink,
      )
    },
  })
}
