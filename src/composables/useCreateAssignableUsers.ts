import type { Ref } from 'vue'
import type { JiraCreateIssueType } from '@/types/jira'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { fetchCreateAssignableUsers } from '@/api/jira'

export function createAssignableUsersQueryKey(issueType: JiraCreateIssueType | null, parentKey: string | null, spaceKey: string | null) {
  return ['create-assignees', issueType, parentKey, spaceKey] as const
}

export function useCreateAssignableUsers(
  issueType: Ref<JiraCreateIssueType | null>,
  parentKey: Ref<string | null>,
  spaceKey: Ref<string | null>,
  enabled?: Ref<boolean>,
) {
  return useQuery({
    queryKey: computed(() => createAssignableUsersQueryKey(issueType.value, parentKey.value, spaceKey.value)),
    queryFn: () => {
      const nextIssueType = issueType.value
      if (!nextIssueType) {
        throw new Error('Issue type is required')
      }

      return fetchCreateAssignableUsers(nextIssueType, parentKey.value, spaceKey.value)
    },
    enabled: computed(() => Boolean(issueType.value) && (Boolean(parentKey.value) || Boolean(spaceKey.value)) && (enabled?.value ?? true)),
    staleTime: 120_000,
  })
}
