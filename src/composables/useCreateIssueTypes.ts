import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchCreateIssueTypes } from '@/api/jira'

export const createIssueTypesQueryKey = (parentKey: string | null) => ['create-issue-types', parentKey]

export function useCreateIssueTypes(
  parentKey: Ref<string | null>,
  enabled?: Ref<boolean>,
) {
  return useQuery({
    queryKey: computed(() => createIssueTypesQueryKey(parentKey.value)),
    queryFn: () => fetchCreateIssueTypes(parentKey.value),
    enabled: computed(() => Boolean(parentKey.value) && (enabled?.value ?? true)),
    staleTime: 120_000,
  })
}
