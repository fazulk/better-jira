import type { ComputedRef, Ref } from 'vue'
import type { CreateFieldOption, HardcodedCreateFieldKey } from './types'
import type { JiraAssignableUser, JiraPriority } from '@/types/jira'
import { LOCAL_PRIORITY_NAMES } from '~/shared/localTickets'

interface FieldOptionsQueryState {
  error: Ref<Error | null>
  isFetching: Ref<boolean>
  isLoading: Ref<boolean>
}

interface CreateFieldOptionsInput {
  createAssignableOptions: ComputedRef<JiraAssignableUser[]>
  createPriorityOptions: ComputedRef<JiraPriority[]>
  assigneesQuery: FieldOptionsQueryState
  prioritiesQuery: FieldOptionsQueryState
  getTextValue: (key: string) => string
  isLocalSpace: ComputedRef<boolean>
}

export function useCreateFieldOptions(input: CreateFieldOptionsInput) {
  function getCreateFieldOptions(fieldKey: HardcodedCreateFieldKey): CreateFieldOption[] {
    if (fieldKey === 'assignee') {
      return [
        { value: '', label: 'Unassigned' },
        ...input.createAssignableOptions.value.map(user => ({
          value: user.accountId,
          label: user.displayName,
        })),
      ]
    }

    if (fieldKey === 'priority') {
      if (input.isLocalSpace.value) {
        return LOCAL_PRIORITY_NAMES.map(name => ({ value: name, label: name }))
      }

      return [
        { value: '', label: 'No priority' },
        ...input.createPriorityOptions.value.map(priority => ({
          value: priority.id,
          label: priority.name,
        })),
      ]
    }

    return []
  }

  function getCreateFieldError(fieldKey: HardcodedCreateFieldKey): string | null {
    if (fieldKey === 'assignee') {
      if (input.isLocalSpace.value)
        return null
      const error = input.assigneesQuery.error.value
      return error instanceof Error ? error.message : null
    }

    if (fieldKey === 'priority') {
      if (input.isLocalSpace.value)
        return null
      const error = input.prioritiesQuery.error.value
      return error instanceof Error ? error.message : null
    }

    return null
  }

  function isCreateFieldLoading(fieldKey: HardcodedCreateFieldKey): boolean {
    if (fieldKey === 'assignee') {
      if (input.isLocalSpace.value)
        return false
      return input.assigneesQuery.isLoading.value || input.assigneesQuery.isFetching.value
    }

    if (fieldKey === 'priority') {
      if (input.isLocalSpace.value)
        return false
      return input.prioritiesQuery.isLoading.value || input.prioritiesQuery.isFetching.value
    }

    return false
  }

  function getSelectedPriorityName(): string {
    const value = input.getTextValue('priority')
    if (input.isLocalSpace.value) {
      return value || 'Medium'
    }

    if (!value)
      return 'No priority'
    const selectedPriority = input.createPriorityOptions.value.find(priority => priority.id === value)
    return selectedPriority?.name ?? 'No priority'
  }

  function getSelectedAssigneeName(): string {
    const value = input.getTextValue('assignee')
    if (!value)
      return 'Unassigned'
    const selectedAssignee = input.createAssignableOptions.value.find(assignee => assignee.accountId === value)
    return selectedAssignee?.displayName ?? 'Unassigned'
  }

  return {
    getCreateFieldError,
    getCreateFieldOptions,
    getSelectedAssigneeName,
    getSelectedPriorityName,
    isCreateFieldLoading,
  }
}
