import type { ComputedRef, Ref } from 'vue'
import type { HardcodedCreateFieldDefinition, HardcodedCreateFieldKey } from './types'
import type {
  JiraAssignableUser,
  JiraCreateFieldValue,
  JiraCreateIssueType,
  JiraPriority,
  JiraTicket,
} from '@/types/jira'
import { watch } from 'vue'
import { isLocalPriorityName, isLocalTicketKey, LOCAL_ISSUE_TYPE, LOCAL_SPACE_KEY } from '~/shared/localTickets'
import { getDefaultIssueType } from './issueTypePolicy'
import { focusElementById } from './useCreateTicketShortcuts'

interface SpaceOption {
  key: string
  name: string
}

interface CreateTicketFormSyncInput {
  attachmentNotice: Ref<string | null>
  createAssignableOptions: ComputedRef<JiraAssignableUser[]>
  createPriorityOptions: ComputedRef<JiraPriority[]>
  createSpaceOptions: ComputedRef<SpaceOption[]>
  effectiveSpaceKey: ComputedRef<string | null>
  fields: ComputedRef<HardcodedCreateFieldDefinition[]>
  fieldValues: Ref<Record<string, JiraCreateFieldValue>>
  getTextValue: (key: string) => string
  initialIssueType: ComputedRef<JiraCreateIssueType>
  initialParentKey: ComputedRef<string | null>
  isLocalSpace: ComputedRef<boolean>
  issueTypeOptions: ComputedRef<JiraCreateIssueType[]>
  lastCreatedSpaceKey: Ref<string | null>
  open: ComputedRef<boolean>
  parentKey: Ref<string | null>
  parentLocked: ComputedRef<boolean>
  selectedIssueType: Ref<JiraCreateIssueType>
  selectedParentTicket: ComputedRef<JiraTicket | null>
  selectedSpaceKey: Ref<string | null>
  stopEditingAssignee: () => void
  stopEditingParent: () => void
  submitError: Ref<string | null>
  supportedParentTickets: ComputedRef<JiraTicket[]>
  supportedParentType: ComputedRef<string | null>
  tickets: ComputedRef<JiraTicket[]>
  updateFieldValue: (key: string, value: string) => void
}

export function useCreateTicketFormSync(input: CreateTicketFormSyncInput) {
  function isAvailableCreateSpace(spaceKey: string | null): boolean {
    if (!spaceKey)
      return false
    return input.createSpaceOptions.value.some(space => space.key === spaceKey)
  }

  function selectedParentLocksSpace(): boolean {
    const parentIssueType = input.selectedParentTicket.value?.issueType.toLowerCase() ?? ''
    return Boolean(input.selectedParentTicket.value?.spaceKey) && !parentIssueType.includes('initiative')
  }

  function selectedParentRequiresJiraSpace(): boolean {
    const parentKey = input.parentKey.value ?? input.initialParentKey.value
    return Boolean(parentKey && !isLocalTicketKey(parentKey))
  }

  function getDefaultCreateSpaceKey(): string | null {
    const parentSpaceKey = selectedParentLocksSpace()
      ? input.selectedParentTicket.value?.spaceKey ?? null
      : null
    if (parentSpaceKey)
      return parentSpaceKey
    if (
      isAvailableCreateSpace(input.lastCreatedSpaceKey.value)
      && (!selectedParentRequiresJiraSpace() || input.lastCreatedSpaceKey.value !== LOCAL_SPACE_KEY)
    ) {
      return input.lastCreatedSpaceKey.value
    }
    if (selectedParentRequiresJiraSpace()) {
      return input.createSpaceOptions.value.find(space => space.key !== LOCAL_SPACE_KEY)?.key ?? null
    }
    return input.createSpaceOptions.value[0]?.key ?? null
  }

  function syncSelectedSpaceKey() {
    const parentSpaceKey = selectedParentLocksSpace()
      ? input.selectedParentTicket.value?.spaceKey ?? null
      : null
    if (parentSpaceKey) {
      input.selectedSpaceKey.value = parentSpaceKey
      return
    }

    if (isAvailableCreateSpace(input.selectedSpaceKey.value))
      return
    input.selectedSpaceKey.value = getDefaultCreateSpaceKey()
  }

  function resetForm() {
    const initialParentTicket = input.initialParentKey.value
      ? input.tickets.value.find(ticket => ticket.key === input.initialParentKey.value) ?? null
      : null

    input.selectedSpaceKey.value = initialParentTicket?.issueType.toLowerCase().includes('initiative')
      ? getDefaultCreateSpaceKey()
      : initialParentTicket?.spaceKey ?? getDefaultCreateSpaceKey()
    input.parentKey.value = input.initialParentKey.value

    const spaceIsLocal = input.selectedSpaceKey.value === LOCAL_SPACE_KEY
      || initialParentTicket?.spaceKey === LOCAL_SPACE_KEY

    input.selectedIssueType.value = spaceIsLocal
      ? LOCAL_ISSUE_TYPE
      : getDefaultIssueType(initialParentTicket?.issueType ?? null, input.initialIssueType.value)

    input.fieldValues.value = {}
    input.submitError.value = null
    input.attachmentNotice.value = null
    input.stopEditingParent()
    input.stopEditingAssignee()
  }

  function setDefaultFieldValues(definitions: HardcodedCreateFieldDefinition[]) {
    const nextValues: Record<string, JiraCreateFieldValue> = {}

    for (const definition of definitions) {
      const currentValue = input.fieldValues.value[definition.key]
      nextValues[definition.key] = currentValue !== undefined
        ? currentValue
        : definition.defaultValue ?? ''
    }

    input.fieldValues.value = nextValues
  }

  function syncParentForIssueType() {
    if (!input.selectedIssueType.value) {
      input.parentKey.value = null
      input.stopEditingParent()
      return
    }

    if (input.parentLocked.value) {
      input.parentKey.value = input.initialParentKey.value
      input.stopEditingParent()
      return
    }

    if (!input.parentKey.value)
      return
    const isStillValid = input.supportedParentTickets.value.some(ticket => ticket.key === input.parentKey.value)
    if (!isStillValid) {
      input.parentKey.value = null
      input.stopEditingParent()
    }
  }

  function syncSelectedIssueType() {
    const options = input.issueTypeOptions.value
    if (!options.length) {
      input.selectedIssueType.value = ''
      return
    }

    if (input.initialIssueType.value && options.includes(input.initialIssueType.value)) {
      if (input.selectedIssueType.value !== input.initialIssueType.value) {
        input.selectedIssueType.value = input.initialIssueType.value
      }
      return
    }

    const firstOption = options[0]
    if (!options.includes(input.selectedIssueType.value) && firstOption) {
      input.selectedIssueType.value = firstOption
    }
  }

  function syncSelectableFieldValue(key: HardcodedCreateFieldKey, availableValues: readonly string[]) {
    const currentValue = input.getTextValue(key)
    if (currentValue && !availableValues.includes(currentValue)) {
      input.updateFieldValue(key, '')
    }
  }

  function resetAfterSuccessfulCreate() {
    const previousSpaceKey = input.effectiveSpaceKey.value
    resetForm()
    if (previousSpaceKey && isAvailableCreateSpace(previousSpaceKey)) {
      input.selectedSpaceKey.value = previousSpaceKey
    }
    focusElementById('create-field-summary')
  }

  watch(() => input.initialIssueType.value, (issueType) => {
    if (!input.open.value)
      return
    input.selectedIssueType.value = getDefaultIssueType(input.selectedParentTicket.value?.issueType ?? null, issueType)
  })

  watch(() => input.initialParentKey.value, (nextParentKey) => {
    if (!input.open.value)
      return
    input.parentKey.value = nextParentKey
  })

  watch([input.createSpaceOptions, input.selectedParentTicket, input.lastCreatedSpaceKey], () => {
    if (!input.open.value)
      return
    syncSelectedSpaceKey()
  }, { immediate: true })

  watch(input.selectedIssueType, () => {
    if (!input.open.value)
      return
    input.submitError.value = null
    syncParentForIssueType()
  })

  watch(input.issueTypeOptions, () => {
    if (input.open.value)
      syncSelectedIssueType()
  })

  watch(input.supportedParentTickets, () => {
    if (input.open.value)
      syncParentForIssueType()
  })

  watch(input.supportedParentType, (nextParentType) => {
    if (!nextParentType)
      input.stopEditingParent()
  })

  watch(input.createAssignableOptions, () => {
    if (input.isLocalSpace.value)
      return
    syncSelectableFieldValue('assignee', input.createAssignableOptions.value.map(assignee => assignee.accountId))
    if (input.createAssignableOptions.value.length === 0)
      input.stopEditingAssignee()
  })

  watch(input.createPriorityOptions, () => {
    if (!input.isLocalSpace.value) {
      syncSelectableFieldValue('priority', input.createPriorityOptions.value.map(priority => priority.id))
    }
  })

  watch(input.isLocalSpace, (local) => {
    if (!input.open.value)
      return

    if (local) {
      input.selectedIssueType.value = LOCAL_ISSUE_TYPE
      const priority = input.getTextValue('priority')
      if (!isLocalPriorityName(priority))
        input.updateFieldValue('priority', 'Medium')
      input.updateFieldValue('assignee', '')
      syncParentForIssueType()
      input.stopEditingAssignee()
      return
    }

    syncSelectedIssueType()
    syncParentForIssueType()
    syncSelectableFieldValue('assignee', input.createAssignableOptions.value.map(assignee => assignee.accountId))
    syncSelectableFieldValue('priority', input.createPriorityOptions.value.map(priority => priority.id))
  })

  watch(input.fields, (definitions) => {
    if (input.open.value)
      setDefaultFieldValues(definitions)
  }, { immediate: true })

  return {
    resetAfterSuccessfulCreate,
    resetForm,
  }
}
