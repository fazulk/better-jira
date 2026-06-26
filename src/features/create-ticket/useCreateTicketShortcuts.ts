import { nextTick, type ComputedRef, type Ref } from 'vue'
import type { JiraCreateIssueType } from '@/types/jira'

interface CreateTicketShortcutsInput {
  canSubmit: ComputedRef<boolean>
  closeModal: () => void
  isCreatePending: ComputedRef<boolean>
  isIssueTypeLocked: ComputedRef<boolean>
  isLocalSpace: ComputedRef<boolean>
  issueTypeOptions: ComputedRef<JiraCreateIssueType[]>
  selectedIssueType: Ref<JiraCreateIssueType>
  startEditingAssignee: () => void
  submit: () => Promise<void>
  teamSelector: Ref<{ focus: () => void } | null>
  priorityField: Ref<{ focus: () => void } | null>
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName.toLowerCase()
  return target.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
}

export function focusElementById(id: string) {
  nextTick(() => {
    const element = document.getElementById(id)
    if (element instanceof HTMLElement) {
      element.focus()
    }
  })
}

export function useCreateTicketShortcuts(input: CreateTicketShortcutsInput) {
  function focusSpaceSelect() {
    nextTick(() => {
      input.teamSelector.value?.focus()
    })
  }

  function focusPrioritySelect() {
    nextTick(() => {
      input.priorityField.value?.focus()
    })
  }

  function selectNextIssueType() {
    if (input.isCreatePending.value || input.isIssueTypeLocked.value || input.isLocalSpace.value) return

    const options = input.issueTypeOptions.value
    if (options.length <= 1) return

    const currentIndex = options.findIndex((issueType) => issueType === input.selectedIssueType.value)
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length
    input.selectedIssueType.value = options[nextIndex] ?? input.selectedIssueType.value
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      if (input.canSubmit.value) {
        void input.submit()
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      input.closeModal()
      return
    }

    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    if (isEditableShortcutTarget(event.target)) return

    const key = event.key.toLowerCase()
    if (key === 's') {
      event.preventDefault()
      focusSpaceSelect()
      return
    }

    if (key === 'i') {
      event.preventDefault()
      selectNextIssueType()
      return
    }

    if (key === 'p') {
      event.preventDefault()
      focusPrioritySelect()
      return
    }

    if (key === 'a') {
      event.preventDefault()
      input.startEditingAssignee()
      return
    }

    if (key === 'd') {
      event.preventDefault()
      focusElementById('create-field-duedate')
      return
    }

    if (key === 't') {
      event.preventDefault()
      focusElementById('create-field-summary')
    }
  }

  return { handleComposerKeydown }
}
