<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useCreateAssignableUsers } from '@/composables/useCreateAssignableUsers'
import { useCreateLocalTicket } from '@/composables/useCreateLocalTicket'
import { useCreatePriorities } from '@/composables/useCreatePriorities'
import { useCreateTicket } from '@/composables/useCreateTicket'
import { useJiraCurrentUser } from '@/composables/useJiraCurrentUser'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { readLocalStorageString, readLocalStorageStringArray } from '@/utils/browserStorage'
import { isSupportedEditorAdf, plainTextToAdf } from '~/shared/jiraAdf'
import {
  isLocalTicketKey,
  LOCAL_ISSUE_TYPE,
  LOCAL_PRIORITY_NAMES,
  LOCAL_SPACE_KEY,
} from '~/shared/localTickets'
import type {
  JiraAssignableUser,
  JiraCreateFieldValue,
  JiraCreateIssueType,
  JiraPriority,
  JiraTicket,
} from '@/types/jira'

const props = withDefaults(defineProps<{
  open: boolean
  tickets: JiraTicket[]
  initialIssueType?: JiraCreateIssueType
  initialParentKey?: string | null
  issueTypeLocked?: boolean
  parentLocked?: boolean
}>(), {
  initialIssueType: 'Task',
  initialParentKey: null,
  issueTypeLocked: false,
  parentLocked: false,
})

const emit = defineEmits<{
  close: []
  created: [key: string]
}>()

const priorityConfig: Record<string, { bg: string }> = {
  Highest: { bg: 'bg-rose-400' },
  High: { bg: 'bg-orange-400' },
  Medium: { bg: 'bg-amber-400' },
  Low: { bg: 'bg-sky-400' },
  Lowest: { bg: 'bg-slate-400' },
}

const avatarColors = [
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/20',
  'bg-amber-500/20 text-amber-300 border-amber-500/20',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/20',
  'bg-rose-500/20 text-rose-300 border-rose-500/20',
  'bg-sky-500/20 text-sky-300 border-sky-500/20',
]

type HardcodedCreateFieldKey = 'summary' | 'description' | 'assignee' | 'priority' | 'duedate'

interface HardcodedCreateFieldBase {
  key: HardcodedCreateFieldKey
  label: string
  required: boolean
}

interface HardcodedCreateTextFieldDefinition extends HardcodedCreateFieldBase {
  type: 'text' | 'textarea' | 'date'
  defaultValue?: string
}

interface HardcodedCreateSelectFieldDefinition extends HardcodedCreateFieldBase {
  type: 'single-select'
  defaultValue?: string
}

type HardcodedCreateFieldDefinition =
  | HardcodedCreateTextFieldDefinition
  | HardcodedCreateSelectFieldDefinition

const HARDCODED_CREATE_FIELDS: HardcodedCreateFieldDefinition[] = [
  { key: 'summary', label: 'Title', required: true, type: 'text', defaultValue: '' },
  { key: 'description', label: 'Description', required: false, type: 'textarea', defaultValue: '' },
  { key: 'priority', label: 'Priority', required: false, type: 'single-select', defaultValue: '' },
  { key: 'assignee', label: 'Assignee', required: false, type: 'single-select', defaultValue: '' },
  { key: 'duedate', label: 'Due Date', required: false, type: 'date', defaultValue: '' },
]

const selectedIssueType = ref<JiraCreateIssueType>(props.initialIssueType)
const selectedSpaceKey = ref<string | null>(null)
const parentKey = ref<string | null>(props.initialParentKey)
const fieldValues = ref<Record<string, JiraCreateFieldValue>>({})
const submitError = ref<string | null>(null)

const createMutation = useCreateTicket()
const createLocalMutation = useCreateLocalTicket()
const { enabledSpaces, hasJiraCredentialsConfigured } = useSpaceSettings()

const isCreatePending = computed(() => createMutation.isPending.value || createLocalMutation.isPending.value)
const effectiveParentKey = computed(() => (
  props.parentLocked && props.open
    ? props.initialParentKey || null
    : parentKey.value || null
))
const activeIssueType = computed<JiraCreateIssueType | null>(() => (
  props.open && selectedIssueType.value ? selectedIssueType.value : null
))
const isEditingParent = ref(false)
const parentSearch = ref('')
const parentHighlightIndex = ref(0)
const parentInputRef = ref<HTMLInputElement | null>(null)
const parentComboRef = ref<HTMLDivElement | null>(null)
const isEditingAssignee = ref(false)
const assigneeSearch = ref('')
const assigneeHighlightIndex = ref(0)
const assigneeInputRef = ref<HTMLInputElement | null>(null)
const assigneeComboRef = ref<HTMLDivElement | null>(null)
const RECENT_ASSIGNEES_KEY = 'recent-assignees'
const LAST_CREATED_SPACE_KEY = 'jira2.last-created-space-key'
const MAX_RECENT = 5
const recentAssigneeIds = ref<string[]>(readLocalStorageStringArray(RECENT_ASSIGNEES_KEY))
const lastCreatedSpaceKey = ref<string | null>(readLocalStorageString(LAST_CREATED_SPACE_KEY))

const selectedParentTicket = computed<JiraTicket | null>(() => {
  if (!effectiveParentKey.value) return null
  return props.tickets.find((ticket) => ticket.key === effectiveParentKey.value) ?? null
})

const createSpaceOptions = computed(() => enabledSpaces.value.map((space) => ({
  key: space.key,
  name: space.name || space.key,
})))

const effectiveSpaceKey = computed<string | null>(() => (
  selectedParentTicket.value?.spaceKey ?? selectedSpaceKey.value
))

const isLocalSpace = computed(() => effectiveSpaceKey.value === LOCAL_SPACE_KEY)

const jiraFieldQueriesEnabled = computed(() => props.open && !isLocalSpace.value && hasJiraCredentialsConfigured.value)

const isSpaceLocked = computed(() => Boolean(selectedParentTicket.value?.spaceKey))

const createAssignableUsersQuery = useCreateAssignableUsers(activeIssueType, effectiveParentKey, effectiveSpaceKey, jiraFieldQueriesEnabled)
const createPrioritiesQuery = useCreatePriorities(activeIssueType, effectiveParentKey, jiraFieldQueriesEnabled)

const jiraMeQueryEnabled = computed(() => props.open && isLocalSpace.value && hasJiraCredentialsConfigured.value)
const jiraMeQuery = useJiraCurrentUser(jiraMeQueryEnabled)

function isAvailableCreateSpace(spaceKey: string | null): boolean {
  if (!spaceKey) {
    return false
  }

  return createSpaceOptions.value.some((space) => space.key === spaceKey)
}

function getDefaultCreateSpaceKey(): string | null {
  const parentSpaceKey = selectedParentTicket.value?.spaceKey ?? null
  if (parentSpaceKey) {
    return parentSpaceKey
  }

  if (isAvailableCreateSpace(lastCreatedSpaceKey.value)) {
    return lastCreatedSpaceKey.value
  }

  return createSpaceOptions.value[0]?.key ?? null
}

function syncSelectedSpaceKey() {
  const parentSpaceKey = selectedParentTicket.value?.spaceKey ?? null
  if (parentSpaceKey) {
    selectedSpaceKey.value = parentSpaceKey
    return
  }

  if (isAvailableCreateSpace(selectedSpaceKey.value)) {
    return
  }

  selectedSpaceKey.value = getDefaultCreateSpaceKey()
}

function getAllowedIssueTypesForParent(parentIssueType: string | null): JiraCreateIssueType[] {
  if (!parentIssueType) {
    return ['Epic', 'Story', 'Task', 'Bug']
  }

  const normalizedParentIssueType = parentIssueType.toLowerCase()
  if (normalizedParentIssueType.includes('epic') || normalizedParentIssueType.includes('story')) {
    return ['Story', 'Task', 'Bug']
  }

  if (normalizedParentIssueType.includes('task') || normalizedParentIssueType.includes('bug')) {
    return ['Task']
  }

  return []
}

const issueTypeOptions = computed<JiraCreateIssueType[]>(() => {
  if (isLocalSpace.value) {
    return [LOCAL_ISSUE_TYPE as JiraCreateIssueType]
  }

  return getAllowedIssueTypesForParent(selectedParentTicket.value?.issueType ?? null)
})

function getDefaultIssueType(parentIssueType: string | null, preferredIssueType?: JiraCreateIssueType): JiraCreateIssueType {
  const options = getAllowedIssueTypesForParent(parentIssueType)
  if (preferredIssueType && options.includes(preferredIssueType)) {
    return preferredIssueType
  }

  return options[0] ?? ''
}

function canIssueTypeUseParent(childIssueType: string, parentIssueType: string): boolean {
  const normalizedChildIssueType = childIssueType.toLowerCase()
  const normalizedParentIssueType = parentIssueType.toLowerCase()

  if (normalizedChildIssueType.includes('epic')) {
    return false
  }

  if (normalizedChildIssueType.includes('story') || normalizedChildIssueType.includes('bug')) {
    return normalizedParentIssueType.includes('epic') || normalizedParentIssueType.includes('story')
  }

  if (normalizedChildIssueType.includes('task')) {
    return (
      normalizedParentIssueType.includes('epic')
      || normalizedParentIssueType.includes('story')
      || normalizedParentIssueType.includes('task')
      || normalizedParentIssueType.includes('bug')
    )
  }

  return false
}

const supportedParentType = computed(() => {
  return (effectiveParentKey.value || (selectedIssueType.value && !selectedIssueType.value.toLowerCase().includes('epic')))
    ? 'Issue'
    : null
})

const supportedParentTickets = computed(() => {
  if (!selectedIssueType.value || selectedIssueType.value.toLowerCase().includes('epic')) return []

  const base = [...props.tickets]
    .filter((ticket) => canIssueTypeUseParent(selectedIssueType.value, ticket.issueType))

  const scoped = isLocalSpace.value
    ? base.filter((ticket) => isLocalTicketKey(ticket.key))
    : base

  return scoped.sort((left, right) => `${left.key} ${left.summary}`.localeCompare(`${right.key} ${right.summary}`, undefined, { sensitivity: 'base' }))
})

const fields = computed(() => HARDCODED_CREATE_FIELDS)
const primaryFields = computed(() => fields.value.filter((field) => field.key === 'summary' || field.key === 'description'))

function getIssueTypeBadgeClass(issueType: JiraCreateIssueType): string {
  const normalizedType = issueType.toLowerCase()
  if (normalizedType.includes('epic')) return 'issue-badge-epic'
  if (normalizedType.includes('story')) return 'issue-badge-story'
  if (normalizedType.includes('bug')) return 'issue-badge-bug'
  if (normalizedType.includes('sub')) return 'issue-badge-subtask'
  return 'issue-badge-task'
}

function resetForm() {
  const initialParentTicket = props.initialParentKey
    ? props.tickets.find((ticket) => ticket.key === props.initialParentKey) ?? null
    : null

  selectedSpaceKey.value = initialParentTicket?.spaceKey ?? getDefaultCreateSpaceKey()
  parentKey.value = props.initialParentKey

  const spaceIsLocal = selectedSpaceKey.value === LOCAL_SPACE_KEY
    || initialParentTicket?.spaceKey === LOCAL_SPACE_KEY

  selectedIssueType.value = spaceIsLocal
    ? (LOCAL_ISSUE_TYPE as JiraCreateIssueType)
    : getDefaultIssueType(initialParentTicket?.issueType ?? null, props.initialIssueType)

  fieldValues.value = {}
  submitError.value = null
  stopEditingParent()
  stopEditingAssignee()
}

function setDefaultFieldValues(definitions: HardcodedCreateFieldDefinition[]) {
  const nextValues: Record<string, JiraCreateFieldValue> = {}

  for (const definition of definitions) {
    const currentValue = fieldValues.value[definition.key]
    if (currentValue !== undefined) {
      nextValues[definition.key] = currentValue
      continue
    }

    nextValues[definition.key] = definition.defaultValue ?? ''
  }

  fieldValues.value = nextValues
}

function syncParentForIssueType() {
  if (!selectedIssueType.value || selectedIssueType.value.toLowerCase().includes('epic')) {
    parentKey.value = null
    stopEditingParent()
    return
  }

  if (props.parentLocked) {
    parentKey.value = props.initialParentKey
    stopEditingParent()
    return
  }

  if (!parentKey.value) return
  const isStillValid = supportedParentTickets.value.some((ticket) => ticket.key === parentKey.value)
  if (!isStillValid) {
    parentKey.value = null
    stopEditingParent()
  }
}

function syncSelectedIssueType() {
  const options = issueTypeOptions.value
  if (!options.length) {
    selectedIssueType.value = ''
    return
  }

  if (props.initialIssueType && options.includes(props.initialIssueType)) {
    if (selectedIssueType.value !== props.initialIssueType) {
      selectedIssueType.value = props.initialIssueType
    }
    return
  }

  if (!options.includes(selectedIssueType.value)) {
    selectedIssueType.value = options[0]
  }
}

function closeModal() {
  if (isCreatePending.value) return
  emit('close')
}

function updateFieldValue(key: string, value: string) {
  fieldValues.value = {
    ...fieldValues.value,
    [key]: value,
  }
}

function syncSelectableFieldValue(
  key: HardcodedCreateFieldKey,
  availableValues: readonly string[],
) {
  const currentValue = getTextValue(key)
  if (!currentValue) return

  if (!availableValues.includes(currentValue)) {
    updateFieldValue(key, '')
  }
}

function getTextValue(key: string): string {
  const value = fieldValues.value[key]
  return typeof value === 'string' ? value : ''
}

const createAssignableOptions = computed<JiraAssignableUser[]>(() => createAssignableUsersQuery.data.value ?? [])
const createPriorityOptions = computed<JiraPriority[]>(() => createPrioritiesQuery.data.value ?? [])

function getCreateFieldOptions(fieldKey: HardcodedCreateFieldKey): Array<{ value: string; label: string }> {
  if (fieldKey === 'assignee') {
    return [
      { value: '', label: 'Unassigned' },
      ...createAssignableOptions.value.map((user) => ({
        value: user.accountId,
        label: user.displayName,
      })),
    ]
  }

  if (fieldKey === 'priority') {
    if (isLocalSpace.value) {
      return LOCAL_PRIORITY_NAMES.map((name) => ({ value: name, label: name }))
    }

    return [
      { value: '', label: 'No priority' },
      ...createPriorityOptions.value.map((priority) => ({
        value: priority.id,
        label: priority.name,
      })),
    ]
  }

  return []
}

const filteredParentOptions = computed(() => {
  const query = parentSearch.value.trim().toLowerCase()
  if (!query) return supportedParentTickets.value

  return supportedParentTickets.value.filter((ticket) => (
    ticket.key.toLowerCase().includes(query)
    || ticket.summary.toLowerCase().includes(query)
  ))
})

function getSelectedParentTicket(): JiraTicket | null {
  if (!effectiveParentKey.value) return null
  return supportedParentTickets.value.find((ticket) => ticket.key === effectiveParentKey.value) ?? null
}

function getSelectedParentLabel(): string {
  const ticket = getSelectedParentTicket()
  if (!ticket) return `No parent ${supportedParentType.value ?? ''}`.trim()
  return `${ticket.key} · ${ticket.summary}`
}

function getSelectedSpaceName(): string {
  const currentSpaceKey = effectiveSpaceKey.value
  if (!currentSpaceKey) {
    return 'No space selected'
  }

  return createSpaceOptions.value.find((space) => space.key === currentSpaceKey)?.name ?? currentSpaceKey
}

const assignableOptions = computed(() => [
  { accountId: '__unassigned__', displayName: 'Unassigned' },
  ...createAssignableOptions.value,
])

function addRecentAssignee(accountId: string) {
  if (accountId === '__unassigned__') return
  const updated = [accountId, ...recentAssigneeIds.value.filter((id) => id !== accountId)].slice(0, MAX_RECENT)
  recentAssigneeIds.value = updated
  localStorage.setItem(RECENT_ASSIGNEES_KEY, JSON.stringify(updated))
}

const recentComboOptions = computed(() => {
  const ids = recentAssigneeIds.value
  if (!ids.length) return []

  const query = assigneeSearch.value.toLowerCase().trim()
  const recent = ids
    .map((id) => assignableOptions.value.find((option) => option.accountId === id))
    .filter((option): option is NonNullable<typeof option> => option !== undefined)

  if (!query) return recent
  return recent.filter((option) => option.displayName.toLowerCase().includes(query))
})

const nonRecentComboOptions = computed(() => {
  const recentIds = new Set(recentAssigneeIds.value)
  const query = assigneeSearch.value.toLowerCase().trim()
  const filtered = query
    ? assignableOptions.value.filter((option) => option.displayName.toLowerCase().includes(query))
    : assignableOptions.value

  return filtered.filter((option) => !recentIds.has(option.accountId))
})

const flatComboOptions = computed(() => [...recentComboOptions.value, ...nonRecentComboOptions.value])

function getCreateFieldError(fieldKey: HardcodedCreateFieldKey): string | null {
  if (fieldKey === 'assignee') {
    if (isLocalSpace.value) return null
    const error = createAssignableUsersQuery.error.value
    return error instanceof Error ? error.message : null
  }

  if (fieldKey === 'priority') {
    if (isLocalSpace.value) return null
    const error = createPrioritiesQuery.error.value
    return error instanceof Error ? error.message : null
  }

  return null
}

function isCreateFieldLoading(fieldKey: HardcodedCreateFieldKey): boolean {
  if (fieldKey === 'assignee') {
    if (isLocalSpace.value) return false
    return createAssignableUsersQuery.isLoading.value || createAssignableUsersQuery.isFetching.value
  }

  if (fieldKey === 'priority') {
    if (isLocalSpace.value) return false
    return createPrioritiesQuery.isLoading.value || createPrioritiesQuery.isFetching.value
  }

  return false
}

function getSelectedPriorityName(): string {
  const value = getTextValue('priority')
  if (isLocalSpace.value) {
    return value || 'Medium'
  }

  if (!value) return 'No priority'
  const selectedPriority = createPriorityOptions.value.find((priority) => priority.id === value)
  return selectedPriority?.name ?? 'No priority'
}

function getSelectedAssigneeName(): string {
  const value = getTextValue('assignee')
  if (!value) return 'Unassigned'
  const selectedAssignee = createAssignableOptions.value.find((assignee) => assignee.accountId === value)
  return selectedAssignee?.displayName ?? 'Unassigned'
}

function getAssigneeInitials(name: string): string {
  if (!name || name === 'Unassigned') return '?'

  const parts = name.split(/\s+/).filter((part) => part.length > 0)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }

  return name.slice(0, 2).toUpperCase()
}

function getAssigneeAvatarClass(name: string): string {
  if (!name || name === 'Unassigned') {
    return 'bg-slate-500/15 text-slate-400 border-slate-500/15'
  }

  const hash = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return avatarColors[hash % avatarColors.length]
}

function handleAssigneeClickOutside(event: MouseEvent) {
  const target = event.target
  if (assigneeComboRef.value && target instanceof Node && !assigneeComboRef.value.contains(target)) {
    stopEditingAssignee()
  }
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
  if (isCreatePending.value || props.parentLocked || !supportedParentType.value) return

  isEditingParent.value = true
  parentSearch.value = ''
  parentHighlightIndex.value = 0
  document.addEventListener('mousedown', handleParentClickOutside)

  nextTick(() => {
    parentInputRef.value?.focus()
  })
}

function selectParentOption(key: string | null) {
  parentKey.value = key
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
    if (option) {
      selectParentOption(option.key)
    }
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    stopEditingParent()
  }
}

function stopEditingAssignee() {
  isEditingAssignee.value = false
  assigneeSearch.value = ''
  assigneeHighlightIndex.value = 0
  document.removeEventListener('mousedown', handleAssigneeClickOutside)
}

function startEditingAssignee() {
  if (isCreatePending.value || isLocalSpace.value) return

  isEditingAssignee.value = true
  assigneeSearch.value = ''
  assigneeHighlightIndex.value = 0
  document.addEventListener('mousedown', handleAssigneeClickOutside)

  nextTick(() => {
    assigneeInputRef.value?.focus()
  })
}

function selectAssigneeOption(accountId: string) {
  const nextValue = accountId === '__unassigned__' ? '' : accountId
  updateFieldValue('assignee', nextValue)
  assigneeSearch.value = ''
  addRecentAssignee(accountId)
  stopEditingAssignee()
}

function scrollAssigneeHighlightIntoView() {
  nextTick(() => {
    const item = assigneeComboRef.value?.querySelector(`[data-idx="${assigneeHighlightIndex.value}"]`)
    if (item instanceof HTMLElement) {
      item.scrollIntoView({ block: 'nearest' })
    }
  })
}

function handleAssigneeKeydown(event: KeyboardEvent) {
  const options = flatComboOptions.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    assigneeHighlightIndex.value = Math.min(assigneeHighlightIndex.value + 1, options.length - 1)
    scrollAssigneeHighlightIntoView()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    assigneeHighlightIndex.value = Math.max(assigneeHighlightIndex.value - 1, 0)
    scrollAssigneeHighlightIntoView()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const option = options[assigneeHighlightIndex.value]
    if (option) {
      selectAssigneeOption(option.accountId)
    }
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    stopEditingAssignee()
  }
}

function getInputValue(event: Event): string {
  const target = event.target
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    return target.value
  }

  return ''
}

async function submit() {
  if (isCreatePending.value) return

  submitError.value = null

  const nextSpaceKey = effectiveSpaceKey.value
  if (!nextSpaceKey) {
    submitError.value = 'Choose a space before creating an issue.'
    return
  }

  if (isLocalSpace.value) {
    const summary = getTextValue('summary').trim()
    if (!summary) {
      submitError.value = 'Title is required.'
      return
    }

    const me = jiraMeQuery.data.value
    if (jiraMeQuery.isLoading.value || jiraMeQuery.isFetching.value) {
      submitError.value = 'Loading your Jira profile for assignee…'
      return
    }

    if (!me?.displayName) {
      const err = jiraMeQuery.error.value
      submitError.value = err instanceof Error
        ? err.message
        : 'Could not load your Jira display name. Local tickets are assigned to you.'
      return
    }

    const descriptionText = getTextValue('description')
    const descriptionAdf = plainTextToAdf(descriptionText)
    if (descriptionAdf && !isSupportedEditorAdf(descriptionAdf)) {
      submitError.value = 'Description contains unsupported content.'
      return
    }

    const priorityName = getTextValue('priority') || 'Medium'
    const dueRaw = getTextValue('duedate').trim()

    try {
      const createdTicket = await createLocalMutation.mutateAsync({
        summary,
        descriptionAdf,
        priority: priorityName,
        assigneeName: me.displayName,
        parentKey: effectiveParentKey.value,
        dueDate: dueRaw || null,
      })

      lastCreatedSpaceKey.value = LOCAL_SPACE_KEY
      localStorage.setItem(LAST_CREATED_SPACE_KEY, LOCAL_SPACE_KEY)

      emit('created', createdTicket.key)
    } catch (err) {
      submitError.value = err instanceof Error ? err.message : 'Failed to create ticket.'
    }

    return
  }

  if (!selectedIssueType.value) return

  try {
    const createdTicket = await createMutation.mutateAsync({
      issueType: selectedIssueType.value,
      spaceKey: nextSpaceKey,
      parentKey: effectiveParentKey.value,
      fields: fieldValues.value,
    })

    const persistedSpaceKey = createdTicket.spaceKey || nextSpaceKey
    lastCreatedSpaceKey.value = persistedSpaceKey
    localStorage.setItem(LAST_CREATED_SPACE_KEY, persistedSpaceKey)

    emit('created', createdTicket.key)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Failed to create ticket.'
  }
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  resetForm()
})

watch(() => props.initialIssueType, (issueType) => {
  if (!props.open) return
  selectedIssueType.value = getDefaultIssueType(selectedParentTicket.value?.issueType ?? null, issueType)
})

watch(() => props.initialParentKey, (nextParentKey) => {
  if (!props.open) return
  parentKey.value = nextParentKey
})

watch([createSpaceOptions, selectedParentTicket, lastCreatedSpaceKey], () => {
  if (!props.open) return
  syncSelectedSpaceKey()
}, { immediate: true })

watch(selectedIssueType, () => {
  if (!props.open) return
  submitError.value = null
  syncParentForIssueType()
})

watch(issueTypeOptions, () => {
  if (!props.open) return
  syncSelectedIssueType()
})

watch(supportedParentTickets, () => {
  if (!props.open) return
  syncParentForIssueType()
})

watch(parentSearch, () => {
  parentHighlightIndex.value = 0
})

watch(supportedParentType, (nextParentType) => {
  if (!nextParentType) {
    stopEditingParent()
  }
})

watch(assigneeSearch, () => {
  assigneeHighlightIndex.value = 0
})

watch(createAssignableOptions, () => {
  if (isLocalSpace.value) return

  syncSelectableFieldValue('assignee', createAssignableOptions.value.map((assignee) => assignee.accountId))

  if (createAssignableOptions.value.length === 0) {
    stopEditingAssignee()
  }
})

watch(createPriorityOptions, () => {
  if (isLocalSpace.value) return

  syncSelectableFieldValue('priority', createPriorityOptions.value.map((priority) => priority.id))
})

watch(isLocalSpace, (local) => {
  if (!props.open) return

  if (local) {
    selectedIssueType.value = LOCAL_ISSUE_TYPE as JiraCreateIssueType
    const p = getTextValue('priority')
    if (!(LOCAL_PRIORITY_NAMES as readonly string[]).includes(p)) {
      updateFieldValue('priority', 'Medium')
    }
    updateFieldValue('assignee', '')
    syncParentForIssueType()
    stopEditingAssignee()
    return
  }

  syncSelectedIssueType()
  syncParentForIssueType()
  syncSelectableFieldValue('assignee', createAssignableOptions.value.map((assignee) => assignee.accountId))
  syncSelectableFieldValue('priority', createPriorityOptions.value.map((priority) => priority.id))
})

watch(fields, (definitions) => {
  if (!props.open) return
  setDefaultFieldValues(definitions)
}, { immediate: true })

onUnmounted(() => {
  document.removeEventListener('mousedown', handleParentClickOutside)
  document.removeEventListener('mousedown', handleAssigneeClickOutside)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm"
        @click.self="closeModal"
      >
        <div class="w-full max-w-2xl rounded-3xl border border-white/[0.08] bg-surface-1 shadow-2xl shadow-black/50">
          <div class="flex items-start justify-between border-b border-white/[0.06] px-6 py-5">
            <div>
              <p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {{ isLocalSpace ? 'Local ticket' : 'Create issue' }}
              </p>
              <h2 class="mt-1 text-lg font-semibold text-white">
                {{ isLocalSpace ? 'New local ticket' : `New ${selectedIssueType || 'Issue'}` }}
              </h2>
            </div>
            <button
              type="button"
              class="rounded-xl border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
              :disabled="isCreatePending.value"
              @click="closeModal"
            >
              Close
            </button>
          </div>

          <div class="space-y-5 px-6 py-5">
            <div class="space-y-2">
              <label for="create-space" class="text-[11px] uppercase tracking-[0.14em] text-slate-500">Space</label>
              <select
                id="create-space"
                :value="effectiveSpaceKey ?? ''"
                class="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isCreatePending.value || isSpaceLocked || createSpaceOptions.length === 0"
                @change="selectedSpaceKey = getInputValue($event) || null"
              >
                <option value="" disabled>
                  {{ createSpaceOptions.length === 0 ? 'No enabled spaces available' : 'Choose a space' }}
                </option>
                <option
                  v-for="space in createSpaceOptions"
                  :key="space.key"
                  :value="space.key"
                >
                  {{ space.name }} ({{ space.key }})
                </option>
              </select>
              <p v-if="isSpaceLocked" class="text-xs text-slate-500">
                Space is fixed by the selected parent: {{ getSelectedSpaceName() }}.
              </p>
              <p v-else-if="createSpaceOptions.length === 0" class="text-xs text-amber-200">
                Enable at least one space in settings before creating a top-level issue.
              </p>
              <p v-else class="text-xs text-slate-500">
                New top-level issues default to your last used space. Choose Local for app-only tickets.
              </p>
            </div>

            <div v-if="!isLocalSpace" class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.14em] text-slate-500">Issue Type</p>
              <p v-if="issueTypeOptions.length === 0" class="text-xs text-slate-500">
                No issue types are available for this parent.
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="issueType in issueTypeOptions"
                  :key="issueType"
                  type="button"
                  class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                  :class="selectedIssueType === issueType
                    ? getIssueTypeBadgeClass(issueType)
                    : `${getIssueTypeBadgeClass(issueType)} opacity-60 hover:opacity-100`"
                  :disabled="issueTypeLocked || isCreatePending.value"
                  @click="selectedIssueType = issueType"
                >
                  {{ issueType }}
                </button>
              </div>
            </div>

            <div v-else class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.14em] text-slate-500">Issue Type</p>
              <div
                class="inline-flex rounded-full border px-3 py-1.5 text-xs font-medium issue-badge-task"
              >
                Task
              </div>
              <p class="text-xs text-slate-500">
                Local tickets are always tasks.
              </p>
            </div>

            <div v-if="supportedParentType" class="space-y-2">
              <label class="text-[11px] uppercase tracking-[0.14em] text-slate-500">Parent {{ supportedParentType }}</label>
              <div
                ref="parentComboRef"
                class="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 transition"
                :class="[
                  isEditingParent ? 'border-indigo-500/40' : 'hover:border-white/[0.12]',
                  parentLocked
                    ? 'cursor-not-allowed border-white/[0.04] bg-white/[0.015] text-slate-500 opacity-60'
                    : '',
                  isCreatePending.value ? 'opacity-70' : '',
                ]"
              >
                <div v-if="isEditingParent" class="space-y-2">
                  <div class="relative">
                    <svg class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                      ref="parentInputRef"
                      v-model="parentSearch"
                      class="w-full rounded-xl border border-white/[0.08] bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-indigo-400"
                  :placeholder="`Search ${supportedParentType.toLowerCase()}s...`"
                      @keydown="handleParentKeydown"
                    />
                  </div>
                  <div class="max-h-56 overflow-y-auto rounded-xl border border-white/[0.08] bg-slate-950 py-1 shadow-xl shadow-black/30">
                    <button
                      type="button"
                      data-parent-idx="0"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                      :class="parentHighlightIndex === 0 ? 'bg-indigo-500/20 text-white' : 'text-slate-300 hover:bg-white/[0.04]'"
                      @click="selectParentOption(null)"
                      @mouseenter="parentHighlightIndex = 0"
                    >
                      No parent
                    </button>
                    <button
                      v-for="(ticket, index) in filteredParentOptions"
                      :key="ticket.key"
                      type="button"
                      :data-parent-idx="index + 1"
                      class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
                      :class="parentHighlightIndex === index + 1 ? 'bg-indigo-500/20 text-white' : 'text-slate-300 hover:bg-white/[0.04]'"
                      @click="selectParentOption(ticket.key)"
                      @mouseenter="parentHighlightIndex = index + 1"
                    >
                      <span class="mt-0.5 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-500">{{ ticket.key }}</span>
                      <span class="min-w-0 text-xs leading-5">{{ ticket.summary }}</span>
                    </button>
                    <div v-if="filteredParentOptions.length === 0" class="px-3 py-2 text-xs italic text-slate-600">
                      No matching {{ supportedParentType.toLowerCase() }}s
                    </div>
                  </div>
                </div>
                <button
                  v-else
                  type="button"
                  class="flex w-full items-center justify-between gap-3 text-left"
                  :disabled="parentLocked || isCreatePending.value"
                  @click="startEditingParent"
                >
                  <div class="min-w-0">
                    <div class="text-sm text-slate-200 truncate">{{ getSelectedParentLabel() }}</div>
                    <div class="text-xs text-slate-500">
                      {{ effectiveParentKey ? `Change ${supportedParentType.toLowerCase()}` : `Choose a ${supportedParentType.toLowerCase()} or leave empty` }}
                    </div>
                  </div>
                  <svg class="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              <p v-if="parentLocked && effectiveParentKey" class="text-xs text-slate-500">
                Parent is fixed for this create flow.
              </p>
            </div>

            <div class="space-y-4">
              <div
                v-for="field in primaryFields"
                :key="field.key"
                class="space-y-2"
              >
                <label :for="`create-field-${field.key}`" class="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <span>{{ field.label }}</span>
                  <span v-if="field.required" class="text-xs uppercase tracking-[0.12em] text-rose-300">Required</span>
                </label>

                <input
                  v-if="field.type === 'text'"
                  :id="`create-field-${field.key}`"
                  :value="getTextValue(field.key)"
                  type="text"
                  class="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-indigo-500/40"
                  :disabled="isCreatePending.value"
                  @input="updateFieldValue(field.key, getInputValue($event))"
                />

                <textarea
                  v-else-if="field.type === 'textarea'"
                  :id="`create-field-${field.key}`"
                  :value="getTextValue(field.key)"
                  rows="5"
                  class="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-indigo-500/40"
                  :disabled="isCreatePending.value"
                  @input="updateFieldValue(field.key, getInputValue($event))"
                />

                <input
                  v-else-if="field.type === 'date'"
                  :id="`create-field-${field.key}`"
                  :value="getTextValue(field.key)"
                  type="date"
                  class="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-indigo-500/40"
                  :disabled="isCreatePending.value"
                  @input="updateFieldValue(field.key, getInputValue($event))"
                />

                <select
                  v-else
                  :id="`create-field-${field.key}`"
                  :value="getTextValue(field.key)"
                  class="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-indigo-500/40"
                  :disabled="isCreatePending.value || isCreateFieldLoading(field.key)"
                  @change="updateFieldValue(field.key, getInputValue($event))"
                >
                  <option
                    v-for="option in getCreateFieldOptions(field.key)"
                    :key="`${field.key}-${option.value || 'empty'}`"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>

                <p v-if="isCreateFieldLoading(field.key)" class="text-xs text-slate-500">
                  Loading {{ field.label.toLowerCase() }} options...
                </p>
                <p v-else-if="getCreateFieldError(field.key)" class="text-xs text-rose-300">
                  {{ getCreateFieldError(field.key) }}
                </p>

              </div>

              <div class="flex flex-wrap items-start gap-3">
                <div class="space-y-2">
                  <label for="create-field-priority" class="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <span>Priority</span>
                  </label>
                  <div class="group relative flex items-center gap-1.5">
                    <div class="flex items-center gap-2">
                      <select
                        id="create-field-priority"
                        :value="getTextValue('priority')"
                        class="rounded-full border border-white/[0.08] bg-slate-950 px-3 py-1 text-xs text-slate-200 outline-none transition focus:border-indigo-400"
                        :disabled="isCreatePending.value || isCreateFieldLoading('priority')"
                        @change="updateFieldValue('priority', getInputValue($event))"
                      >
                        <option
                          v-for="option in getCreateFieldOptions('priority')"
                          :key="`priority-${option.value || 'empty'}`"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </option>
                      </select>
                      <div class="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1">
                        <span
                          class="h-1.5 w-1.5 rounded-full"
                          :class="priorityConfig[getSelectedPriorityName()]?.bg || 'bg-slate-500'"
                        ></span>
                        <span class="text-[11px] font-medium text-slate-400">{{ getSelectedPriorityName() }}</span>
                      </div>
                    </div>
                  </div>
                  <p v-if="isCreateFieldLoading('priority')" class="text-xs text-slate-500">
                    Loading priority options...
                  </p>
                  <p v-else-if="getCreateFieldError('priority')" class="text-xs text-rose-300">
                    {{ getCreateFieldError('priority') }}
                  </p>
                </div>

                <div class="min-w-0 flex-1 space-y-2">
                  <label class="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <span>Assignee</span>
                  </label>
                  <div
                    v-if="isLocalSpace"
                    class="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
                  >
                    <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                      <span class="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-200">You</span>
                      <span v-if="jiraMeQuery.isLoading.value || jiraMeQuery.isFetching.value" class="text-slate-500">Loading your Jira name…</span>
                      <span v-else-if="jiraMeQuery.data.value">{{ jiraMeQuery.data.value.displayName }}</span>
                      <span v-else-if="jiraMeQuery.isError.value" class="text-rose-300">Could not load Jira profile</span>
                    </div>
                    <p class="mt-1.5 text-[10px] leading-relaxed text-slate-600">
                      Local tickets are always assigned to you, using your Jira display name.
                    </p>
                    <button
                      v-if="jiraMeQuery.isError.value"
                      type="button"
                      class="mt-2 text-[11px] text-indigo-400/90 hover:text-indigo-300"
                      @click="jiraMeQuery.refetch()"
                    >
                      Retry
                    </button>
                  </div>
                  <div
                    v-else
                    class="group relative flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] py-1 pl-1.5 pr-2.5 transition hover:border-white/[0.1] hover:bg-white/[0.04]"
                  >
                    <div v-if="isEditingAssignee" ref="assigneeComboRef" class="relative">
                      <div class="flex items-center gap-2">
                        <div class="relative">
                          <svg class="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="m21 21-4.35-4.35" />
                          </svg>
                          <input
                            id="create-field-assignee"
                            ref="assigneeInputRef"
                            v-model="assigneeSearch"
                            class="w-48 rounded-lg border border-white/[0.08] bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-indigo-400"
                            placeholder="Search assignees..."
                            @keydown="handleAssigneeKeydown"
                          />
                        </div>
                        <button
                          type="button"
                          class="rounded-full border border-white/[0.08] px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/[0.04]"
                          @click="stopEditingAssignee"
                        >
                          ✕
                        </button>
                        <span v-if="isCreateFieldLoading('assignee')" class="text-[11px] text-slate-500">Loading...</span>
                        <span v-if="getCreateFieldError('assignee')" class="text-[11px] text-rose-300">{{ getCreateFieldError('assignee') }}</span>
                      </div>
                      <div class="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-white/[0.08] bg-slate-950 py-1 shadow-xl shadow-black/40">
                        <template v-if="recentComboOptions.length">
                          <div class="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">Recent</div>
                          <button
                            v-for="(option, i) in recentComboOptions"
                            :key="option.accountId"
                            type="button"
                            :data-idx="i"
                            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
                            :class="assigneeHighlightIndex === i ? 'bg-indigo-500/20 text-white' : 'text-slate-300 hover:bg-white/[0.04]'"
                            @click="selectAssigneeOption(option.accountId)"
                            @mouseenter="assigneeHighlightIndex = i"
                          >
                            {{ option.displayName }}
                          </button>
                          <div class="mx-2 my-1 border-t border-white/[0.06]"></div>
                        </template>
                        <template v-if="nonRecentComboOptions.length">
                          <button
                            v-for="(option, j) in nonRecentComboOptions"
                            :key="option.accountId"
                            type="button"
                            :data-idx="recentComboOptions.length + j"
                            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
                            :class="assigneeHighlightIndex === recentComboOptions.length + j ? 'bg-indigo-500/20 text-white' : 'text-slate-300 hover:bg-white/[0.04]'"
                            @click="selectAssigneeOption(option.accountId)"
                            @mouseenter="assigneeHighlightIndex = recentComboOptions.length + j"
                          >
                            {{ option.displayName }}
                          </button>
                        </template>
                        <div v-if="!flatComboOptions.length" class="px-3 py-2 text-xs italic text-slate-600">
                          No matching users
                        </div>
                      </div>
                    </div>
                    <button v-else type="button" class="flex items-center gap-1.5 cursor-pointer" @click="startEditingAssignee">
                      <div
                        class="flex h-4 w-4 items-center justify-center rounded-full border text-[8px] font-bold"
                        :class="getAssigneeAvatarClass(getSelectedAssigneeName())"
                      >
                        {{ getAssigneeInitials(getSelectedAssigneeName()) }}
                      </div>
                      <span class="text-[11px] font-medium text-slate-300">{{ getSelectedAssigneeName() }}</span>
                    </button>
                  </div>
                </div>

                <div class="space-y-2">
                  <label for="create-field-duedate" class="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <span>Due Date</span>
                  </label>
                  <input
                    id="create-field-duedate"
                    :value="getTextValue('duedate')"
                    type="date"
                    class="rounded-full border border-white/[0.08] bg-slate-950 px-3 py-1 text-xs text-slate-200 outline-none transition focus:border-indigo-400"
                    :disabled="isCreatePending.value"
                    @input="updateFieldValue('duedate', getInputValue($event))"
                  />
                </div>
              </div>
            </div>

            <div v-if="submitError" class="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {{ submitError }}
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-4">
            <button
              type="button"
              class="rounded-2xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
              :disabled="isCreatePending.value"
              @click="closeModal"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-2xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isCreatePending.value || !selectedIssueType || !effectiveSpaceKey || (isLocalSpace && (jiraMeQuery.isLoading.value || jiraMeQuery.isFetching.value))"
              @click="submit"
            >
              {{
                isCreatePending.value
                  ? 'Creating...'
                  : (isLocalSpace ? 'Create local ticket' : `Create ${selectedIssueType || 'Issue'}`)
              }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
