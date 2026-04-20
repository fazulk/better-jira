import { type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchJiraCurrentUser } from '@/api/jira'

export const jiraCurrentUserQueryKey = ['jira-current-user'] as const

export function useJiraCurrentUser(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: jiraCurrentUserQueryKey,
    queryFn: fetchJiraCurrentUser,
    enabled,
    staleTime: 60 * 60 * 1000,
  })
}
