import type { ComputedRef, Ref } from 'vue'
import type { JiraTicket } from '@/types/jira'
import { computed, nextTick, ref } from 'vue'

interface ParentPickerInput {
  effectiveParentKey: ComputedRef<string | null>
  isCreatePending: ComputedRef<boolean>
  parentKey: Ref<string | null>
  parentLocked: ComputedRef<boolean>
  selectedParentIsProject: ComputedRef<boolean>
  supportedParentDisplayLabel: ComputedRef<string | null>
  supportedParentTickets: ComputedRef<JiraTicket[]>
  supportedParentType: ComputedRef<string | null>
}

export function useParentPicker(input: ParentPickerInput) {
  const isEditingParent = ref(false)
  const parentSearch = ref('')
  const parentHighlightIndex = ref(0)
  const parentInputRef = ref<HTMLInputElement | null>(null)
  const parentComboRef = ref<HTMLDivElement | null>(null)

  const filteredParentOptions = computed(() => {
    const query = parentSearch.value.trim().toLowerCase()
    if (!query)
      return input.supportedParentTickets.value

    return input.supportedParentTickets.value.filter(ticket => (
      ticket.key.toLowerCase().includes(query)
      || ticket.summary.toLowerCase().includes(query)
    ))
  })

  function getSelectedParentTicket(): JiraTicket | null {
    if (!input.effectiveParentKey.value)
      return null
    return input.supportedParentTickets.value.find(ticket => ticket.key === input.effectiveParentKey.value) ?? null
  }

  function getSelectedParentLabel(): string {
    const ticket = getSelectedParentTicket()
    if (!ticket)
      return input.selectedParentIsProject.value ? 'No project' : `No parent ${input.supportedParentType.value ?? ''}`.trim()
    if (ticket.issueType.toLowerCase().includes('epic'))
      return ticket.summary
    return `${ticket.key} · ${ticket.summary}`
  }

  function getSupportedParentTypeLabel(): string {
    return input.supportedParentDisplayLabel.value?.toLowerCase() ?? 'parent'
  }

  function getSupportedParentArticleLabel(): string {
    const label = getSupportedParentTypeLabel()
    return /^[aeiou]/.test(label) ? `an ${label}` : `a ${label}`
  }

  function handleParentClickOutside(event: MouseEvent) {
    const target = event.target
    if (parentComboRef.value && target instanceof Node && !parentComboRef.value.contains(target)) {
      stopEditingParent()
    }
  }

  function stopEditingParent() {
    isEditingParent.value = false
    parentSearch.value = ''
    parentHighlightIndex.value = 0
    document.removeEventListener('mousedown', handleParentClickOutside)
  }

  function startEditingParent() {
    if (input.isCreatePending.value || input.parentLocked.value || !input.supportedParentType.value)
      return

    isEditingParent.value = true
    parentSearch.value = ''
    parentHighlightIndex.value = 0
    document.addEventListener('mousedown', handleParentClickOutside)

    nextTick(() => {
      parentInputRef.value?.focus()
    })
  }

  function selectParentOption(key: string | null) {
    input.parentKey.value = key
    stopEditingParent()
  }

  function scrollParentHighlightIntoView() {
    nextTick(() => {
      const item = parentComboRef.value?.querySelector(`[data-parent-idx="${parentHighlightIndex.value}"]`)
      if (item instanceof HTMLElement) {
        item.scrollIntoView({ block: 'nearest' })
      }
    })
  }

  function handleParentKeydown(event: KeyboardEvent) {
    const options = filteredParentOptions.value
    const optionCount = options.length + 1

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      parentHighlightIndex.value = Math.min(parentHighlightIndex.value + 1, optionCount - 1)
      scrollParentHighlightIntoView()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      parentHighlightIndex.value = Math.max(parentHighlightIndex.value - 1, 0)
      scrollParentHighlightIntoView()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (parentHighlightIndex.value === 0) {
        selectParentOption(null)
        return
      }

      const option = options[parentHighlightIndex.value - 1]
      if (option)
        selectParentOption(option.key)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      stopEditingParent()
    }
  }

  return {
    filteredParentOptions,
    getSelectedParentLabel,
    getSupportedParentArticleLabel,
    getSupportedParentTypeLabel,
    handleParentKeydown,
    isEditingParent,
    parentComboRef,
    parentHighlightIndex,
    parentInputRef,
    parentSearch,
    selectParentOption,
    startEditingParent,
    stopEditingParent,
  }
}
