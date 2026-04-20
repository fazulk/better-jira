import { computed, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { fetchAssignableUsers } from '@/api/jira'
import type { JiraAssignableUser } from '@/types/jira'

export const assignableUsersQueryKey = (ticketKey: string | null) => ['ticket-assignees', ticketKey] as const
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

export function useAssignableUsers(
  ticketKey: Ref<string | null>,
  options?: { queryEnabled?: Ref<boolean> },
) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: computed(() => assignableUsersQueryKey(ticketKey.value)),
    queryFn: ({ queryKey }) => {
      const [, key] = queryKey as ReturnType<typeof assignableUsersQueryKey>
      return fetchAssignableUsers(key as string)
    },
    enabled: computed(() => {
      if (!ticketKey.value) return false
      if (options?.queryEnabled && !options.queryEnabled.value) return false
      return true
    }),
    initialData: () => {
      const key = ticketKey.value
      if (!key) return undefined
      return queryClient.getQueryData<JiraAssignableUser[]>(assignableUsersQueryKey(key))
    },
    initialDataUpdatedAt: () => {
      const key = ticketKey.value
      if (!key) return undefined
      return queryClient.getQueryState(assignableUsersQueryKey(key))?.dataUpdatedAt
    },
    staleTime: TWO_DAYS_MS,
    gcTime: TWO_DAYS_MS,
  })
}
