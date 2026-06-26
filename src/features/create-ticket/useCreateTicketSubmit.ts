import type { ComputedRef, Ref } from 'vue'
import type { JiraCreateFieldValue, JiraCreateIssueType } from '@/types/jira'
import { isSupportedEditorAdf, plainTextToAdf } from '~/shared/jiraAdf'
import { LOCAL_SPACE_KEY } from '~/shared/localTickets'

interface JiraMe {
  displayName: string
}

interface QueryState<T> {
  data: Ref<T | undefined> | ComputedRef<T | undefined>
  error: Ref<Error | null> | ComputedRef<Error | null>
  isFetching: Ref<boolean> | ComputedRef<boolean>
  isLoading: Ref<boolean> | ComputedRef<boolean>
}

interface LocalCreateInput {
  summary: string
  descriptionAdf: ReturnType<typeof plainTextToAdf>
  priority: string
  assigneeName: string
  parentKey: string | null
  dueDate: string | null
}

interface RemoteCreateInput {
  issueType: JiraCreateIssueType
  spaceKey: string
  parentKey: string | null
  fields: Record<string, JiraCreateFieldValue>
}

interface CreatedTicket {
  key: string
  spaceKey?: string
}

interface CreateTicketSubmitInput {
  createLocalTicket: (input: LocalCreateInput) => Promise<CreatedTicket>
  createRemoteTicket: (input: RemoteCreateInput) => Promise<CreatedTicket>
  effectiveParentKey: ComputedRef<string | null>
  effectiveSpaceKey: ComputedRef<string | null>
  fieldValues: Ref<Record<string, JiraCreateFieldValue>>
  finishSuccessfulCreate: (key: string) => void
  getTextValue: (key: string) => string
  hasSelectedIssueTypeOption: ComputedRef<boolean>
  isCreatePending: ComputedRef<boolean>
  isLocalSpace: ComputedRef<boolean>
  jiraMeQuery: QueryState<JiraMe>
  lastCreatedSpaceKey: Ref<string | null>
  selectedIssueType: Ref<JiraCreateIssueType>
  submitError: Ref<string | null>
}

const LAST_CREATED_SPACE_KEY = 'jira2.last-created-space-key'

export function useCreateTicketSubmit(input: CreateTicketSubmitInput) {
  async function submit() {
    if (input.isCreatePending.value) return

    input.submitError.value = null

    const nextSpaceKey = input.effectiveSpaceKey.value
    if (!nextSpaceKey) {
      input.submitError.value = 'Choose a space before creating an issue.'
      return
    }

    if (input.isLocalSpace.value) {
      await submitLocalTicket(nextSpaceKey)
      return
    }

    await submitRemoteTicket(nextSpaceKey)
  }

  async function submitLocalTicket(nextSpaceKey: string): Promise<void> {
    const summary = input.getTextValue('summary').trim()
    if (!summary) {
      input.submitError.value = 'Title is required.'
      return
    }

    const me = input.jiraMeQuery.data.value
    if (input.jiraMeQuery.isLoading.value || input.jiraMeQuery.isFetching.value) {
      input.submitError.value = 'Loading your Jira profile for assignee...'
      return
    }

    if (!me?.displayName) {
      const err = input.jiraMeQuery.error.value
      input.submitError.value = err instanceof Error
        ? err.message
        : 'Could not load your Jira display name. Local tickets are assigned to you.'
      return
    }

    const descriptionText = input.getTextValue('description')
    const descriptionAdf = plainTextToAdf(descriptionText)
    if (descriptionAdf && !isSupportedEditorAdf(descriptionAdf)) {
      input.submitError.value = 'Description contains unsupported content.'
      return
    }

    try {
      const createdTicket = await input.createLocalTicket({
        summary,
        descriptionAdf,
        priority: input.getTextValue('priority') || 'Medium',
        assigneeName: me.displayName,
        parentKey: input.effectiveParentKey.value,
        dueDate: input.getTextValue('duedate').trim() || null,
      })

      input.lastCreatedSpaceKey.value = nextSpaceKey
      localStorage.setItem(LAST_CREATED_SPACE_KEY, LOCAL_SPACE_KEY)
      input.finishSuccessfulCreate(createdTicket.key)
    } catch (err) {
      input.submitError.value = err instanceof Error ? err.message : 'Failed to create ticket.'
    }
  }

  async function submitRemoteTicket(nextSpaceKey: string): Promise<void> {
    if (!input.hasSelectedIssueTypeOption.value) {
      input.submitError.value = 'Choose an issue type available for this parent.'
      return
    }

    try {
      const createdTicket = await input.createRemoteTicket({
        issueType: input.selectedIssueType.value,
        spaceKey: nextSpaceKey,
        parentKey: input.effectiveParentKey.value,
        fields: input.fieldValues.value,
      })

      const persistedSpaceKey = createdTicket.spaceKey || nextSpaceKey
      input.lastCreatedSpaceKey.value = persistedSpaceKey
      localStorage.setItem(LAST_CREATED_SPACE_KEY, persistedSpaceKey)
      input.finishSuccessfulCreate(createdTicket.key)
    } catch (err) {
      input.submitError.value = err instanceof Error ? err.message : 'Failed to create ticket.'
    }
  }

  return { submit }
}
