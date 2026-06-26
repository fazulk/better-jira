import type { ComputedRef, Ref } from 'vue'
import type { JiraCreateIssueType, JiraTicket } from '@/types/jira'
import { computed } from 'vue'
import {
  getLinearIssueSubtype,

} from '@/types/jira'
import { isLocalTicketKey, LOCAL_ISSUE_TYPE, LOCAL_SPACE_KEY } from '~/shared/localTickets'
import { canIssueTypeUseParent } from './issueTypePolicy'

interface EnabledSpace {
  key: string
  name?: string
}

interface CreateTicketDerivedStateInput {
  enabledSpaces: ComputedRef<EnabledSpace[]>
  hasJiraCredentialsConfigured: ComputedRef<boolean>
  initialParentKey: ComputedRef<string | null>
  open: ComputedRef<boolean>
  parentKey: Ref<string | null>
  parentLocked: ComputedRef<boolean>
  selectedIssueType: Ref<JiraCreateIssueType>
  selectedSpaceKey: Ref<string | null>
  tickets: ComputedRef<JiraTicket[]>
}

export function useCreateTicketDerivedState(input: CreateTicketDerivedStateInput) {
  const effectiveParentKey = computed(() => (
    input.parentLocked.value && input.open.value
      ? input.initialParentKey.value || null
      : input.parentKey.value || null
  ))

  const activeIssueType = computed<JiraCreateIssueType | null>(() => (
    input.open.value && input.selectedIssueType.value ? input.selectedIssueType.value : null
  ))

  const selectedParentTicket = computed<JiraTicket | null>(() => {
    if (!effectiveParentKey.value)
      return null
    return input.tickets.value.find(ticket => ticket.key === effectiveParentKey.value) ?? null
  })

  const createSpaceOptions = computed(() => input.enabledSpaces.value.map(space => ({
    key: space.key,
    name: space.name || space.key,
  })))

  const effectiveSpaceKey = computed<string | null>(() => (
    selectedParentTicket.value?.spaceKey ?? input.selectedSpaceKey.value
  ))

  const isLocalSpace = computed(() => effectiveSpaceKey.value === LOCAL_SPACE_KEY)
  const createObjectTypeLabel = computed(() => (
    activeIssueType.value?.toLowerCase().includes('epic') ? 'Project' : 'Issue'
  ))
  const createSubtypeLabel = computed(() => {
    if (isLocalSpace.value)
      return getLinearIssueSubtype(LOCAL_ISSUE_TYPE)
    if (!input.selectedIssueType.value || createObjectTypeLabel.value === 'Project')
      return null
    return getLinearIssueSubtype(input.selectedIssueType.value)
  })

  const jiraFieldQueriesEnabled = computed(() => (
    input.open.value && !isLocalSpace.value && input.hasJiraCredentialsConfigured.value
  ))
  const isSpaceLocked = computed(() => Boolean(selectedParentTicket.value?.spaceKey))

  const supportedParentType = computed(() => (
    effectiveParentKey.value || (input.selectedIssueType.value && !input.selectedIssueType.value.toLowerCase().includes('epic'))
      ? 'Issue'
      : null
  ))
  const selectedParentIsProject = computed(() => (
    selectedParentTicket.value?.issueType.toLowerCase().includes('epic') === true
  ))
  const supportedParentDisplayLabel = computed(() => (
    selectedParentIsProject.value ? 'Project' : supportedParentType.value
  ))

  const supportedParentTickets = computed(() => {
    if (!input.selectedIssueType.value || input.selectedIssueType.value.toLowerCase().includes('epic'))
      return []

    const base = [...input.tickets.value]
      .filter(ticket => canIssueTypeUseParent(input.selectedIssueType.value, ticket.issueType))

    const scoped = isLocalSpace.value
      ? base.filter(ticket => isLocalTicketKey(ticket.key))
      : base

    return scoped.sort((left, right) => `${left.key} ${left.summary}`.localeCompare(`${right.key} ${right.summary}`, undefined, { sensitivity: 'base' }))
  })

  function getSelectedSpaceName(): string {
    const currentSpaceKey = effectiveSpaceKey.value
    if (!currentSpaceKey)
      return 'No space selected'
    return createSpaceOptions.value.find(space => space.key === currentSpaceKey)?.name ?? currentSpaceKey
  }

  return {
    activeIssueType,
    createObjectTypeLabel,
    createSpaceOptions,
    createSubtypeLabel,
    effectiveParentKey,
    effectiveSpaceKey,
    getSelectedSpaceName,
    isLocalSpace,
    isSpaceLocked,
    jiraFieldQueriesEnabled,
    selectedParentIsProject,
    selectedParentTicket,
    supportedParentDisplayLabel,
    supportedParentTickets,
    supportedParentType,
  }
}
