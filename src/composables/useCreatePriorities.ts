import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchAllPriorities } from '@/api/jira'
import type { JiraCreateIssueType } from '@/types/jira'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export const createPrioritiesQueryKey = ['priorities'] as const

export function useCreatePriorities(
  issueType: Ref<JiraCreateIssueType | null>,
  parentKey: Ref<string | null>,
  enabled?: Ref<boolean>,
) {
  void parentKey

  return useQuery({
    queryKey: createPrioritiesQueryKey,
    queryFn: fetchAllPriorities,
    enabled: computed(() => Boolean(issueType.value) && (enabled?.value ?? true)),
    staleTime: THIRTY_DAYS_MS,
    gcTime: THIRTY_DAYS_MS,
  })
}
