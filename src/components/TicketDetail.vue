<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useJiraTicket, ticketQueryKey } from '@/composables/useJiraTicket'
import { useLocalTicket, localTicketQueryKey } from '@/composables/useLocalTicket'
import { getCachedTickets } from '@/composables/useJiraTickets'
import { useAssignableUsers } from '@/composables/useAssignableUsers'
import { usePriorities } from '@/composables/usePriorities'
import { useTransitions } from '@/composables/useTransitions'
import { useJiraActivity } from '@/composables/useJiraMessages'
import { useAddTicketMessage } from '@/composables/useAddTicketMessage'
import { useUpdateTicketAssignee } from '@/composables/useUpdateTicketAssignee'
import { useUpdateTicketPriority } from '@/composables/useUpdateTicketPriority'
import { useUpdateTicketTitle } from '@/composables/useUpdateTicketTitle'
import { useUpdateTicketStatus } from '@/composables/useUpdateTicketStatus'
import { useUpdateTicketDescription } from '@/composables/useUpdateTicketDescription'
import { useUpdateTicketWatching } from '@/composables/useUpdateTicketWatching'
import { useUpdateLocalTicketTitle } from '@/composables/useUpdateLocalTicketTitle'
import { useUpdateLocalTicketDescription } from '@/composables/useUpdateLocalTicketDescription'
import { useUpdateLocalTicketStatus } from '@/composables/useUpdateLocalTicketStatus'
import { useUpdateLocalTicketPriority } from '@/composables/useUpdateLocalTicketPriority'
import { useUpdateLocalTicketAssignee } from '@/composables/useUpdateLocalTicketAssignee'
import { usePinnedTickets } from '@/composables/usePinnedTickets'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { fetchTicket } from '@/api/jira'
import { fetchLocalTicket } from '@/api/localTickets'
import { readLocalStorageStringArray } from '@/utils/browserStorage'
import JiraAdfRenderer from '@/components/JiraAdfRenderer.vue'
import JiraDescriptionEditor from '@/components/JiraDescriptionEditor.vue'
import TicketDescriptionActions from '@/components/TicketDescriptionActions.vue'
import AiDescriptionModal from '@/components/AiDescriptionModal.vue'
import {
  getStatusGroup,
  type JiraActivityComment,
  type JiraActivityItem,
  type JiraAdfDocument,
  type JiraTicket,
} from '@/types/jira'
import { adfToPlainText, coerceDescriptionToAdf, isSupportedEditorAdf } from '~/shared/jiraAdf'
import {
  getLocalStatusIdFromDisplayName,
  getLocalTransitions,
  isLocalTicketKey,
  LOCAL_PRIORITY_NAMES,
} from '~/shared/localTickets'

const props = withDefaults(defineProps<{
  ticketKey: string | null
  mode?: 'inline' | 'panel'
}>(), {
  mode: 'inline',
})
const emit = defineEmits<{
  close: []
  select: [key: string]
  'navigate-view': [viewId: string]
  'create-child': [parentKey: string]
}>()

const { isPinned, togglePinnedTicket } = usePinnedTickets()
const { hasJiraCredentialsConfigured } = useSpaceSettings()
const ticketKey = computed(() => props.ticketKey)
const isLocalTicket = computed(() => isLocalTicketKey(ticketKey.value))
const jiraDataEnabled = computed(() => (
  Boolean(ticketKey.value && !isLocalTicketKey(ticketKey.value) && hasJiraCredentialsConfigured.value)
))

const ticketQuery = useJiraTicket(ticketKey, { queryEnabled: jiraDataEnabled })
const localTicketQuery = useLocalTicket(ticketKey)
const assignableUsersQuery = useAssignableUsers(ticketKey, { queryEnabled: jiraDataEnabled })
const prioritiesQuery = usePriorities(jiraDataEnabled)
const transitionsQuery = useTransitions(ticketKey, { queryEnabled: jiraDataEnabled })
const activityQuery = useJiraActivity(ticketKey, { queryEnabled: jiraDataEnabled })
const updateTitleMutation = useUpdateTicketTitle()
const updateLocalTitleMutation = useUpdateLocalTicketTitle()
const updateAssigneeMutation = useUpdateTicketAssignee()
const updateLocalAssigneeMutation = useUpdateLocalTicketAssignee()
const updatePriorityMutation = useUpdateTicketPriority()
const updateLocalPriorityMutation = useUpdateLocalTicketPriority()
const updateStatusMutation = useUpdateTicketStatus()
const updateLocalStatusMutation = useUpdateLocalTicketStatus()
const updateDescriptionMutation = useUpdateTicketDescription()
const updateLocalDescriptionMutation = useUpdateLocalTicketDescription()
const updateWatchingMutation = useUpdateTicketWatching()
const addMessageMutation = useAddTicketMessage()
const queryClient = useQueryClient()

const cachedTicket = computed<JiraTicket | null>(() => {
  const key = ticketKey.value
  if (!key) return null

  const tickets = getCachedTickets(queryClient)
  return tickets?.find((ticket) => ticket.key === key) ?? null
})

const ticket = computed(() => {
  if (isLocalTicket.value) {
    return localTicketQuery.data.value ?? cachedTicket.value
  }

  return ticketQuery.data.value ?? cachedTicket.value
})
const ticketIsPinned = computed(() => (
  ticket.value ? isPinned(ticket.value.key) : false
))

const detailQueryError = computed(() => (
  isLocalTicket.value ? localTicketQuery.isError.value : ticketQuery.isError.value
))

const localTransitionsList = computed(() => {
  if (!ticket.value || !isLocalTicket.value) return []
  const currentId = getLocalStatusIdFromDisplayName(ticket.value.status)
  return getLocalTransitions(currentId)
})

const priorityDraftLocal = ref('')
const localAssigneeDraft = ref('')
const statusColors: Record<string, string> = {
  new: 'bg-white/[0.035] text-slate-400 border border-white/[0.08]',
  indeterminate: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
  done: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
}

const issueType = computed(() => ticket.value?.issueType?.toLowerCase() || 'task')

const priorityConfig: Record<string, { color: string; bg: string }> = {
  Highest: { color: 'text-red-400', bg: 'bg-red-400' },
  High: { color: 'text-orange-400', bg: 'bg-orange-400' },
  Medium: { color: 'text-yellow-400', bg: 'bg-yellow-400' },
  Low: { color: 'text-sky-400', bg: 'bg-sky-400' },
  Lowest: { color: 'text-slate-400', bg: 'bg-slate-400' },
}

type ProjectDetailHealth = 'On track' | 'At risk' | 'Completed'

const avatarColors = [
  'bg-white/[0.045] text-slate-300 border-white/[0.08]',
  'bg-amber-500/20 text-amber-300 border-amber-500/20',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/20',
  'bg-rose-500/20 text-rose-300 border-rose-500/20',
  'bg-sky-500/20 text-sky-300 border-sky-500/20',
]

function getAssigneeAvatarColor(name: string | undefined) {
  if (!name || name === 'Unassigned') return 'bg-slate-500/15 text-slate-400 border-slate-500/15'
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return avatarColors[hash % avatarColors.length]
}

function getAssigneeInitials(name: string | undefined) {
  if (!name || name === 'Unassigned') return '?'
  const parts = name.split(/\s+/)
  if (parts.length >= 2) return parts[0][0] + parts[1][0]
  return name.slice(0, 2)
}

const avatarColor = computed(() => getAssigneeAvatarColor(ticket.value?.assignee))

const initials = computed(() => getAssigneeInitials(ticket.value?.assignee))

const childTickets = computed<JiraTicket[]>(() => {
  const key = ticketKey.value
  if (!key) return []
  const allTickets = getCachedTickets(queryClient)
  if (!allTickets) return []
  return allTickets.filter((t) => t.parent?.key === key)
})

const isProjectDetail = computed(() => (
  issueType.value.includes('epic')
))
const detailBreadcrumbRoot = computed(() => (isProjectDetail.value ? 'Projects' : 'Issues'))
const detailBreadcrumbSpace = computed(() => (
  ticket.value?.spaceName || ticket.value?.spaceKey || 'Workspace'
))
const detailBreadcrumbViewId = computed(() => {
  const spaceKey = ticket.value?.spaceKey
  if (!spaceKey) return isProjectDetail.value ? 'projects' : 'my-issues'
  return isProjectDetail.value ? `team:${spaceKey}:projects` : `team:${spaceKey}:all`
})
const detailJiraTypeLabel = computed(() => (
  !isLocalTicket.value && ticket.value?.issueType ? ticket.value.issueType : null
))
const detailProjectParent = computed(() => {
  const parent = ticket.value?.parent
  if (!parent || !parent.issueType.toLowerCase().includes('epic')) return null
  return parent
})
const detailProjectParentLabel = computed(() => {
  const parent = detailProjectParent.value
  return parent?.summary ?? ''
})
const detailChildActionLabel = computed(() => (isProjectDetail.value ? 'Add issue' : 'Add sub-issue'))
const detailChildSectionLabel = computed(() => (isProjectDetail.value ? 'Issues' : 'Sub-issues'))
const detailEmptyChildLabel = computed(() => (isProjectDetail.value ? 'No issues linked' : 'No sub-issues'))
const detailWatchActionLabel = computed(() => (ticket.value?.isWatching ? 'Unsubscribe' : 'Subscribe'))
const detailWatchButtonLabel = computed(() => (
  updateWatchingMutation.isPending.value ? 'Saving...' : detailWatchActionLabel.value
))
const detailWatchCountLabel = computed(() => {
  const watchCount = ticket.value?.watchCount
  if (typeof watchCount !== 'number') return null
  return `${watchCount} ${watchCount === 1 ? 'subscriber' : 'subscribers'}`
})
function addActivityParticipantName(names: string[], name: string | undefined): void {
  const nextName = name?.trim()
  if (!nextName || nextName === 'Unassigned' || names.includes(nextName)) return
  names.push(nextName)
}

const detailActivityParticipantNames = computed(() => {
  const names: string[] = []
  const currentTicket = ticket.value
  if (!currentTicket) return names

  for (const name of [currentTicket.reporter, currentTicket.assignee]) {
    addActivityParticipantName(names, name)
  }

  for (const item of activityQuery.data.value ?? []) {
    addActivityParticipantName(names, item.author)
  }

  return names.slice(0, 4)
})
const messageCanSubmit = computed(() => messageDraft.value.trim().length > 0)
const projectCompletedIssueCount = computed(() => (
  childTickets.value.filter((child) => getStatusGroup(child.statusCategory) === 'done').length
))
const projectProgress = computed(() => (
  childTickets.value.length > 0
    ? Math.round((projectCompletedIssueCount.value / childTickets.value.length) * 100)
    : 0
))
const projectDetailHealth = computed<ProjectDetailHealth>(() => {
  const currentTicket = ticket.value
  if (!currentTicket) return 'On track'
  if (getStatusGroup(currentTicket.statusCategory) === 'done' || projectProgress.value === 100) return 'Completed'
  if (currentTicket.status.toLowerCase().includes('block') || projectProgress.value < 25) return 'At risk'
  return 'On track'
})
const projectTargetDateLabel = computed(() => (
  formatDateParts(ticket.value?.dueDate)?.date ?? 'No target'
))
const projectLeadLabel = computed(() => {
  const lead = ticket.value?.assignee
  return lead && lead !== 'Unassigned' ? lead : 'Unassigned'
})
const projectPriorityLabel = computed(() => ticket.value?.priority || 'No priority')
const projectIssueProgressLabel = computed(() => (
  `${projectCompletedIssueCount.value}/${childTickets.value.length}`
))
const projectProgressToneClass = computed(() => {
  if (projectDetailHealth.value === 'At risk') return 'bg-rose-400/80'
  if (projectDetailHealth.value === 'Completed') return 'bg-emerald-400/80'
  return 'bg-sky-400/80'
})

function childStatusClass(category: string) {
  return statusColors[category] || statusColors.indeterminate
}

function getProjectDetailHealthClass(health: ProjectDetailHealth): string {
  if (health === 'At risk') return 'border-rose-500/20 bg-rose-500/10 text-rose-300'
  if (health === 'Completed') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  return 'border-sky-500/20 bg-sky-500/10 text-sky-300'
}

const copiedKey = ref(false)
const copiedUrl = ref(false)
const copiedDescription = ref(false)
const isEditingTitle = ref(false)
const titleDraft = ref('')
const titleError = ref<string | null>(null)
const isEditingDescription = ref(false)
const descriptionEditorRef = ref<{ focusEditor: () => void } | null>(null)
const descriptionDraft = ref<JiraAdfDocument | null>(null)
const descriptionError = ref<string | null>(null)
const showAiModal = ref(false)
const messageDraft = ref('')
const messageError = ref<string | null>(null)
const watchError = ref<string | null>(null)
const messageTextareaRef = ref<HTMLTextAreaElement | null>(null)
const activityComposerOpen = ref(false)
const isEditingAssignee = ref(false)
const assigneeDraft = ref('')
const assigneeError = ref<string | null>(null)
const assigneeSearch = ref('')
const assigneeHighlightIndex = ref(0)
const assigneeInputRef = ref<HTMLInputElement | null>(null)
const assigneeComboRef = ref<HTMLDivElement | null>(null)

// Recently selected assignees (persisted to localStorage)
const RECENT_ASSIGNEES_KEY = 'recent-assignees'
const MAX_RECENT = 5
const recentAssigneeIds = ref<string[]>(readLocalStorageStringArray(RECENT_ASSIGNEES_KEY))

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
  const all = assignableUsersQuery.data.value ?? []
  const recent = ids
    .map((id) => all.find((u) => u.accountId === id))
    .filter((u): u is NonNullable<typeof u> => !!u)
  if (!query) return recent
  return recent.filter((o) => o.displayName.toLowerCase().includes(query))
})

const nonRecentComboOptions = computed(() => {
  const recentIds = new Set(recentAssigneeIds.value)
  const query = assigneeSearch.value.toLowerCase().trim()
  const all = assignableOptions.value
  const filtered = query ? all.filter((o) => o.displayName.toLowerCase().includes(query)) : all
  return filtered.filter((o) => !recentIds.has(o.accountId))
})

const flatComboOptions = computed(() => [...recentComboOptions.value, ...nonRecentComboOptions.value])

function handleAssigneeClickOutside(e: MouseEvent) {
  const target = e.target
  if (target instanceof Node && assigneeComboRef.value && !assigneeComboRef.value.contains(target)) {
    cancelEditingAssignee()
  }
}

function selectAssigneeOption(accountId: string) {
  assigneeDraft.value = accountId
  assigneeSearch.value = ''
  addRecentAssignee(accountId)
  nextTick(() => saveAssignee())
}

function handleAssigneeKeydown(e: KeyboardEvent) {
  const opts = flatComboOptions.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    assigneeHighlightIndex.value = Math.min(assigneeHighlightIndex.value + 1, opts.length - 1)
    scrollAssigneeHighlightIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    assigneeHighlightIndex.value = Math.max(assigneeHighlightIndex.value - 1, 0)
    scrollAssigneeHighlightIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (opts[assigneeHighlightIndex.value]) {
      selectAssigneeOption(opts[assigneeHighlightIndex.value].accountId)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEditingAssignee()
  }
}

function scrollAssigneeHighlightIntoView() {
  nextTick(() => {
    const item = assigneeComboRef.value?.querySelector(`[data-idx="${assigneeHighlightIndex.value}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  })
}

watch(assigneeSearch, () => {
  assigneeHighlightIndex.value = 0
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleAssigneeClickOutside)
  document.removeEventListener('keydown', handleDetailShortcut)
})

const isEditingPriority = ref(false)
const priorityDraft = ref('')
const priorityError = ref<string | null>(null)
const isEditingStatus = ref(false)
const statusDraft = ref('')
const statusError = ref<string | null>(null)

const JIRA_BASE_URL = 'https://lifemd.atlassian.net'

const jiraUrl = computed(() => {
  if (!ticket.value) return ''
  return `${JIRA_BASE_URL}/browse/${ticket.value.key}`
})

const datePartFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const timePartFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

const activityItems = computed(() => activityQuery.data.value ?? [])

function getActivityCreatedAtMs(item: JiraActivityItem): number {
  const createdAtMs = Date.parse(item.createdAt)
  return Number.isNaN(createdAtMs) ? Number.MIN_SAFE_INTEGER : createdAtMs
}

const activityTimelineItems = computed(() => (
  [...activityItems.value].sort((left, right) => (
    getActivityCreatedAtMs(left) - getActivityCreatedAtMs(right)
    || left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' })
  ))
))

const activityCommentById = computed(() => {
  const comments = new Map<string, JiraActivityComment>()
  for (const item of activityItems.value) {
    if (item.kind === 'comment') {
      comments.set(item.id, item)
    }
  }
  return comments
})

function getActivityCommentParent(comment: JiraActivityComment): JiraActivityComment | null {
  const parentMessageId = comment.parentMessageId
  return parentMessageId ? activityCommentById.value.get(parentMessageId) ?? null : null
}

function getActivityCommentParentAuthor(item: JiraActivityItem): string | null {
  if (item.kind !== 'comment') return null
  return getActivityCommentParent(item)?.author ?? null
}

function getActivityHistoryMarkerClass(item: JiraActivityItem): string {
  if (item.kind !== 'history') return 'border-white/[0.14] text-slate-500'

  const field = item.field.trim().toLowerCase()
  if (field === 'created') return 'border-sky-400/35 text-sky-300'
  if (field === 'status') return 'border-amber-400/40 text-amber-300'
  if (field === 'assignee') return 'border-emerald-400/35 text-emerald-300'
  if (field === 'priority') return 'border-rose-400/35 text-rose-300'
  return 'border-white/[0.14] text-slate-500'
}

function getActivityHistoryDotClass(item: JiraActivityItem): string {
  if (item.kind !== 'history') return 'bg-slate-500'

  const field = item.field.trim().toLowerCase()
  if (field === 'created') return 'bg-sky-300'
  if (field === 'status') return 'bg-amber-300'
  if (field === 'assignee') return 'bg-emerald-300'
  if (field === 'priority') return 'bg-rose-300'
  return 'bg-slate-500'
}

const descriptionHasUnsupportedContent = computed(() => {
  const descriptionAdf = ticket.value?.descriptionAdf
  return !!descriptionAdf && !isSupportedEditorAdf(descriptionAdf)
})

const descriptionPlainText = computed(() => {
  const currentTicket = ticket.value
  if (!currentTicket) return ''

  if (currentTicket.descriptionAdf) {
    return adfToPlainText(currentTicket.descriptionAdf).trim()
  }

  return (currentTicket.description ?? '').trim()
})

function hasUnsupportedEditorContent(nextTicket: JiraTicket | null): boolean {
  const descriptionAdf = nextTicket?.descriptionAdf
  return !!descriptionAdf && !isSupportedEditorAdf(descriptionAdf)
}

function getEditableDescriptionAdf(nextTicket: JiraTicket | null): JiraAdfDocument | null {
  if (!nextTicket) return null

  const descriptionAdf = hasUnsupportedEditorContent(nextTicket)
    ? undefined
    : nextTicket.descriptionAdf

  return coerceDescriptionToAdf(nextTicket.description, descriptionAdf)
}

function adfSignature(doc: JiraAdfDocument | null): string {
  return JSON.stringify(doc)
}

function formatDateParts(value: string | undefined): { date: string; time: string | null; relative: string | null } | null {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return { date: value, time: null, relative: null }

  const date = datePartFormatter.format(parsed)
  const time = value.includes('T') ? timePartFormatter.format(parsed) : null
  const relative = getRelativeTime(parsed)

  return { date, time, relative }
}

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const absDiffMs = Math.abs(diffMs)
  const isFuture = diffMs < 0

  const minutes = Math.floor(absDiffMs / 60000)
  const hours = Math.floor(absDiffMs / 3600000)
  const days = Math.floor(absDiffMs / 86400000)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  let label: string
  if (minutes < 1) label = 'just now'
  else if (minutes < 60) label = `${minutes}m`
  else if (hours < 24) label = `${hours}h`
  else if (days < 7) label = `${days}d`
  else if (weeks < 5) label = `${weeks}w`
  else label = `${months}mo`

  if (label === 'just now') return label
  return isFuture ? `in ${label}` : `${label} ago`
}

function formatActivityTime(value: string): string {
  const dateParts = formatDateParts(value)
  return dateParts?.relative ?? dateParts?.date ?? ''
}

async function copyJiraUrl() {
  if (!jiraUrl.value) return
  await navigator.clipboard.writeText(jiraUrl.value)
  copiedUrl.value = true
  setTimeout(() => { copiedUrl.value = false }, 1500)
}

async function copyTicketKey() {
  if (!ticket.value) return
  await navigator.clipboard.writeText(ticket.value.key)
  copiedKey.value = true
  setTimeout(() => { copiedKey.value = false }, 1500)
}

async function copyDescription() {
  if (!descriptionPlainText.value) return
  await navigator.clipboard.writeText(descriptionPlainText.value)
  copiedDescription.value = true
  setTimeout(() => { copiedDescription.value = false }, 1500)
}

async function toggleTicketWatching() {
  const currentTicket = ticket.value
  if (!currentTicket || isLocalTicket.value || updateWatchingMutation.isPending.value) return

  try {
    await updateWatchingMutation.mutateAsync({
      key: currentTicket.key,
      watching: currentTicket.isWatching !== true,
    })
    watchError.value = null
  } catch (err) {
    watchError.value = err instanceof Error ? err.message : 'Failed to update subscription.'
  }
}

function prefetchTicket(key: string) {
  if (isLocalTicketKey(key)) {
    queryClient.prefetchQuery({
      queryKey: localTicketQueryKey(key),
      queryFn: () => fetchLocalTicket(key),
    })
    return
  }

  queryClient.prefetchQuery({
    queryKey: ticketQueryKey(key),
    queryFn: () => fetchTicket(key),
  })
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function focusMessageComposer(): void {
  if (isLocalTicket.value) return
  activityComposerOpen.value = true
  nextTick(() => {
    messageTextareaRef.value?.focus()
  })
}

function handleDetailShortcut(event: KeyboardEvent): void {
  if (!ticket.value || props.mode !== 'inline' || isEditableShortcutTarget(event.target)) {
    return
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return
  }

  if (event.key === 'Escape') {
    emit('close')
    return
  }

  const key = event.key.toLowerCase()
  if (key === 'a') {
    event.preventDefault()
    void startEditingAssignee()
  } else if (key === 'p') {
    event.preventDefault()
    void startEditingPriority()
  } else if (key === 'm') {
    event.preventDefault()
    void startEditingStatus()
  } else if (key === 'c') {
    event.preventDefault()
    focusMessageComposer()
  } else if (key === 'd') {
    event.preventDefault()
    startEditingDescription()
  } else if (key === 't') {
    event.preventDefault()
    startEditingTitle()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleDetailShortcut)
})

watch(ticket, (nextTicket) => {
  titleDraft.value = nextTicket?.summary ?? ''
  titleError.value = null
  isEditingTitle.value = false
  assigneeDraft.value = nextTicket?.assigneeAccountId ?? '__unassigned__'
  assigneeError.value = null
  isEditingAssignee.value = false
  localAssigneeDraft.value = nextTicket?.assignee === 'Unassigned' ? '' : (nextTicket?.assignee ?? '')
  priorityDraft.value = ''
  priorityDraftLocal.value = nextTicket?.priority ?? ''
  priorityError.value = null
  isEditingPriority.value = false
  statusDraft.value = ''
  statusError.value = null
  isEditingStatus.value = false
  descriptionDraft.value = getEditableDescriptionAdf(nextTicket)
  descriptionError.value = null
  isEditingDescription.value = false
  messageDraft.value = ''
  messageError.value = null
  watchError.value = null
}, { immediate: true })

const localAssigneeSuggestions = computed(() => {
  const names = new Set<string>()
  const tickets = getCachedTickets(queryClient) ?? []
  for (const t of tickets) {
    if (isLocalTicketKey(t.key) && t.assignee && t.assignee !== 'Unassigned') {
      names.add(t.assignee)
    }
  }

  return [...names].sort()
})

const localAssigneeDatalistId = computed(() => `local-assignee-dl-${ticketKey.value ?? 'none'}`)

const anyTitlePending = computed(() => (
  updateTitleMutation.isPending.value || updateLocalTitleMutation.isPending.value
))

const anyDescriptionPending = computed(() => (
  updateDescriptionMutation.isPending.value || updateLocalDescriptionMutation.isPending.value
))

const anyPriorityPending = computed(() => (
  updatePriorityMutation.isPending.value || updateLocalPriorityMutation.isPending.value
))

const anyStatusPending = computed(() => (
  updateStatusMutation.isPending.value || updateLocalStatusMutation.isPending.value
))

const anyAssigneePending = computed(() => (
  updateAssigneeMutation.isPending.value || updateLocalAssigneeMutation.isPending.value
))

function startEditingDescription() {
  if (!ticket.value || anyDescriptionPending.value) return
  descriptionDraft.value = getEditableDescriptionAdf(ticket.value)
  descriptionError.value = null
  isEditingDescription.value = true
  nextTick(() => {
    descriptionEditorRef.value?.focusEditor()
  })
}

function cancelEditingDescription() {
  descriptionDraft.value = getEditableDescriptionAdf(ticket.value ?? null)
  descriptionError.value = null
  isEditingDescription.value = false
}

async function saveDescription() {
  if (!ticket.value || anyDescriptionPending.value) return

  const currentDescriptionAdf = getEditableDescriptionAdf(ticket.value)

  if (adfSignature(descriptionDraft.value) === adfSignature(currentDescriptionAdf)) {
    isEditingDescription.value = false
    descriptionError.value = null
    return
  }

  try {
    if (isLocalTicket.value) {
      await updateLocalDescriptionMutation.mutateAsync({
        key: ticket.value.key,
        descriptionAdf: descriptionDraft.value,
      })
    } else {
      await updateDescriptionMutation.mutateAsync({
        key: ticket.value.key,
        descriptionAdf: descriptionDraft.value,
      })
    }
    isEditingDescription.value = false
    descriptionError.value = null
  } catch (err) {
    descriptionError.value = err instanceof Error ? err.message : 'Failed to update description.'
  }
}

async function handleAiDescriptionConfirm(descriptionAdf: JiraAdfDocument | null) {
  if (!ticket.value) return
  try {
    if (isLocalTicket.value) {
      await updateLocalDescriptionMutation.mutateAsync({
        key: ticket.value.key,
        descriptionAdf,
      })
    } else {
      await updateDescriptionMutation.mutateAsync({
        key: ticket.value.key,
        descriptionAdf,
      })
    }
    showAiModal.value = false
  } catch {
    // Modal stays open on error so user doesn't lose their work
  }
}

function startEditingTitle() {
  if (!ticket.value || anyTitlePending.value) return
  titleDraft.value = ticket.value.summary
  titleError.value = null
  isEditingTitle.value = true
}

function cancelEditingTitle() {
  titleDraft.value = ticket.value?.summary ?? ''
  titleError.value = null
  isEditingTitle.value = false
}

async function saveTitle() {
  if (!ticket.value || anyTitlePending.value) return

  const nextTitle = titleDraft.value.trim()
  if (!nextTitle) {
    titleError.value = 'Title cannot be empty.'
    return
  }

  if (nextTitle === ticket.value.summary) {
    isEditingTitle.value = false
    titleError.value = null
    return
  }

  try {
    if (isLocalTicket.value) {
      await updateLocalTitleMutation.mutateAsync({ key: ticket.value.key, title: nextTitle })
    } else {
      await updateTitleMutation.mutateAsync({ key: ticket.value.key, title: nextTitle })
    }
    isEditingTitle.value = false
    titleError.value = null
  } catch (err) {
    titleError.value = err instanceof Error ? err.message : 'Failed to update title.'
  }
}

async function startEditingAssignee() {
  if (!ticket.value || anyAssigneePending.value) return

  if (isLocalTicket.value) {
    localAssigneeDraft.value = ticket.value.assignee === 'Unassigned' ? '' : ticket.value.assignee
    assigneeError.value = null
    isEditingAssignee.value = true
    return
  }

  assigneeDraft.value = ticket.value.assigneeAccountId ?? '__unassigned__'
  assigneeError.value = null
  assigneeSearch.value = ''
  assigneeHighlightIndex.value = 0
  isEditingAssignee.value = true

  document.addEventListener('mousedown', handleAssigneeClickOutside)

  nextTick(() => {
    assigneeInputRef.value?.focus()
  })

  if (!assignableUsersQuery.data.value && !assignableUsersQuery.isFetching.value) {
    try {
      await assignableUsersQuery.refetch()
    } catch {
      assigneeError.value = 'Failed to load assignees.'
    }
  }
}

function cancelEditingAssignee() {
  if (isLocalTicket.value) {
    localAssigneeDraft.value = ticket.value?.assignee === 'Unassigned' ? '' : (ticket.value?.assignee ?? '')
  } else {
    assigneeDraft.value = ticket.value?.assigneeAccountId ?? '__unassigned__'
  }

  assigneeError.value = null
  assigneeSearch.value = ''
  isEditingAssignee.value = false
  document.removeEventListener('mousedown', handleAssigneeClickOutside)
}

const assignableOptions = computed(() => [
  { accountId: '__unassigned__', displayName: 'Unassigned' },
  ...(assignableUsersQuery.data.value ?? []),
])

async function saveAssignee() {
  if (!ticket.value || anyAssigneePending.value) return

  if (isLocalTicket.value) {
    const nextName = localAssigneeDraft.value.trim() || null
    const currentName = ticket.value.assignee === 'Unassigned' ? null : ticket.value.assignee
    if (nextName === currentName) {
      isEditingAssignee.value = false
      assigneeError.value = null
      return
    }

    try {
      await updateLocalAssigneeMutation.mutateAsync({
        key: ticket.value.key,
        assigneeName: nextName,
      })
      isEditingAssignee.value = false
      assigneeError.value = null
    } catch (err) {
      assigneeError.value = err instanceof Error ? err.message : 'Failed to update assignee.'
    }

    return
  }

  const nextAccountId = assigneeDraft.value === '__unassigned__' ? null : assigneeDraft.value
  const currentAccountId = ticket.value.assigneeAccountId ?? null
  if (nextAccountId === currentAccountId) {
    isEditingAssignee.value = false
    assigneeError.value = null
    document.removeEventListener('mousedown', handleAssigneeClickOutside)
    return
  }

  const selectedAssignee = assignableOptions.value.find((option) => option.accountId === assigneeDraft.value)
  const assigneeName = selectedAssignee?.displayName ?? 'Unassigned'

  try {
    await updateAssigneeMutation.mutateAsync({
      key: ticket.value.key,
      accountId: nextAccountId,
      assigneeName,
    })
    isEditingAssignee.value = false
    assigneeError.value = null
    document.removeEventListener('mousedown', handleAssigneeClickOutside)
  } catch (err) {
    assigneeError.value = err instanceof Error ? err.message : 'Failed to update assignee.'
  }
}

async function startEditingStatus() {
  if (!ticket.value || anyStatusPending.value) return
  statusDraft.value = ''
  statusError.value = null
  isEditingStatus.value = true

  if (isLocalTicket.value) {
    return
  }

  if (!transitionsQuery.data.value && !transitionsQuery.isFetching.value) {
    try {
      await transitionsQuery.refetch()
    } catch {
      statusError.value = 'Failed to load transitions.'
    }
  }
}

async function startEditingPriority() {
  if (!ticket.value || anyPriorityPending.value) return

  if (isLocalTicket.value) {
    priorityDraftLocal.value = ticket.value.priority
    priorityError.value = null
    isEditingPriority.value = true
    return
  }

  priorityDraft.value = ''
  priorityError.value = null
  isEditingPriority.value = true

  if (!prioritiesQuery.data.value && !prioritiesQuery.isFetching.value) {
    try {
      await prioritiesQuery.refetch()
    } catch {
      priorityError.value = 'Failed to load priorities.'
    }
  }
}

function cancelEditingPriority() {
  priorityDraft.value = ''
  priorityDraftLocal.value = ticket.value?.priority ?? ''
  priorityError.value = null
  isEditingPriority.value = false
}

async function savePriority() {
  if (!ticket.value || anyPriorityPending.value) return

  if (isLocalTicket.value) {
    if (!priorityDraftLocal.value) {
      priorityError.value = 'Select a priority.'
      return
    }

    if (priorityDraftLocal.value === ticket.value.priority) {
      isEditingPriority.value = false
      priorityError.value = null
      return
    }

    try {
      await updateLocalPriorityMutation.mutateAsync({
        key: ticket.value.key,
        priorityName: priorityDraftLocal.value,
      })
      isEditingPriority.value = false
      priorityError.value = null
    } catch (err) {
      priorityError.value = err instanceof Error ? err.message : 'Failed to update priority.'
    }

    return
  }

  if (!priorityDraft.value) {
    priorityError.value = 'Select a priority.'
    return
  }

  const selectedPriority = prioritiesQuery.data.value?.find((priority) => priority.id === priorityDraft.value)
  if (!selectedPriority) {
    priorityError.value = 'Invalid priority.'
    return
  }

  if (selectedPriority.name === ticket.value.priority) {
    isEditingPriority.value = false
    priorityError.value = null
    return
  }

  try {
    await updatePriorityMutation.mutateAsync({
      key: ticket.value.key,
      priorityId: selectedPriority.id,
      priorityName: selectedPriority.name,
    })
    isEditingPriority.value = false
    priorityError.value = null
  } catch (err) {
    priorityError.value = err instanceof Error ? err.message : 'Failed to update priority.'
  }
}

function cancelEditingStatus() {
  statusDraft.value = ''
  statusError.value = null
  isEditingStatus.value = false
}

async function saveStatus() {
  if (!ticket.value || anyStatusPending.value) return

  if (!statusDraft.value) {
    statusError.value = 'Select a status.'
    return
  }

  if (isLocalTicket.value) {
    const selectedTransition = localTransitionsList.value.find((t) => t.id === statusDraft.value)
    if (!selectedTransition) {
      statusError.value = 'Invalid transition.'
      return
    }

    try {
      await updateLocalStatusMutation.mutateAsync({
        key: ticket.value.key,
        transitionId: selectedTransition.id,
      })
      isEditingStatus.value = false
      statusError.value = null
    } catch (err) {
      statusError.value = err instanceof Error ? err.message : 'Failed to update status.'
    }

    return
  }

  const selectedTransition = transitionsQuery.data.value?.find((t) => t.id === statusDraft.value)
  if (!selectedTransition) {
    statusError.value = 'Invalid transition.'
    return
  }

  try {
    await updateStatusMutation.mutateAsync({
      key: ticket.value.key,
      transitionId: selectedTransition.id,
      statusName: selectedTransition.name,
      statusCategory: selectedTransition.statusCategory,
    })
    isEditingStatus.value = false
    statusError.value = null
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : 'Failed to update status.'
  }
}

async function submitMessage() {
  if (!ticket.value || addMessageMutation.isPending.value) return

  const nextMessage = messageDraft.value.trim()
  if (!nextMessage) {
    return
  }

  try {
    await addMessageMutation.mutateAsync({
      key: ticket.value.key,
      body: nextMessage,
    })
    messageDraft.value = ''
    messageError.value = null
    activityComposerOpen.value = false
  } catch (err) {
    messageError.value = err instanceof Error ? err.message : 'Failed to add message.'
  }
}
</script>

<template>
  <div v-if="ticketKey && mode === 'inline'" class="min-h-full">
    <div v-if="ticket" class="min-h-full animate-fade-in">
      <div class="sticky top-0 z-20 border-b border-white/[0.06] bg-surface-0/95 backdrop-blur">
        <div class="flex min-h-12 items-center justify-between gap-4 px-6">
          <div class="flex min-w-0 items-center gap-2 text-xs text-slate-500">
            <span class="truncate">{{ detailBreadcrumbSpace }}</span>
            <span class="text-slate-700">›</span>
            <button
              type="button"
              class="shrink-0 rounded px-1 py-0.5 text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
              @click="emit('navigate-view', detailBreadcrumbViewId)"
            >
              {{ detailBreadcrumbRoot }}
            </button>
            <template v-if="ticket.parent">
              <span class="text-slate-700">›</span>
              <button
                type="button"
                class="shrink-0 rounded px-1 py-0.5 font-medium text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
                @click="$emit('select', ticket.parent.key)"
                @mouseenter="prefetchTicket(ticket.parent.key)"
              >
                {{ ticket.parent.key }}
              </button>
            </template>
            <span class="text-slate-700">›</span>
            <button
              type="button"
              class="min-w-0 truncate rounded px-1 py-0.5 text-left font-medium text-slate-300 transition hover:bg-white/[0.04] hover:text-slate-100"
              @click="$emit('select', ticket.key)"
            >
              {{ ticket.summary }}
            </button>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-[13px] transition hover:bg-white/[0.04]"
              :class="ticketIsPinned ? 'border-[#d7a543]/30 text-[#d7a543]' : 'text-slate-500 hover:text-[#d7a543]'"
              :aria-label="ticketIsPinned ? `Unpin ${ticket.key}` : `Pin ${ticket.key}`"
              @click="togglePinnedTicket(ticket.key)"
            >
              ★
            </button>
          </div>
        </div>
      </div>

      <div class="grid min-h-[calc(100vh-3rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <main class="min-w-0 px-6 py-8 lg:px-10">
          <div class="mx-auto max-w-3xl">
            <header class="mb-6 border-b border-white/[0.06] pb-5">
              <div class="mb-5">
                <div v-if="isEditingTitle" class="space-y-3">
                  <textarea
                    id="detail-title"
                    v-model="titleDraft"
                    class="min-h-[96px] w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[24px] font-semibold leading-tight text-slate-100 outline-none transition focus:border-white/[0.16]"
                    maxlength="255"
                    placeholder="Issue title"
                    @keydown.meta.enter.prevent="saveTitle"
                    @keydown.ctrl.enter.prevent="saveTitle"
                    @keydown.esc.prevent="cancelEditingTitle"
                  />
                  <div class="flex items-center gap-2">
                    <button
                      class="rounded-md bg-accent-indigo px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="anyTitlePending"
                      @click="saveTitle"
                    >
                      {{ anyTitlePending ? 'Saving...' : 'Save' }}
                    </button>
                    <button
                      class="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="anyTitlePending"
                      @click="cancelEditingTitle"
                    >
                      Cancel
                    </button>
                    <span v-if="titleError" class="text-xs text-rose-300">{{ titleError }}</span>
                  </div>
                </div>
                <div v-else class="group/title flex items-start gap-3">
                  <h1 class="min-w-0 flex-1 text-[28px] font-semibold leading-tight text-slate-100">
                    {{ ticket.summary }}
                  </h1>
                  <button
                    class="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 opacity-0 transition hover:bg-white/[0.05] hover:text-slate-300 group-hover/title:opacity-100"
                    @click="startEditingTitle"
                  >
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div
                v-if="isProjectDetail"
                class="grid overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.015] text-xs md:grid-cols-3 xl:grid-cols-6"
              >
                <div class="border-b border-white/[0.06] px-3 py-2.5 md:border-r xl:border-b-0">
                  <p class="text-[11px] text-slate-600">Health</p>
                  <span
                    class="mt-1 inline-flex max-w-full rounded-md border px-2 py-0.5 font-medium"
                    :class="getProjectDetailHealthClass(projectDetailHealth)"
                  >
                    {{ projectDetailHealth }}
                  </span>
                </div>
                <div class="border-b border-white/[0.06] px-3 py-2.5 md:border-r xl:border-b-0">
                  <p class="text-[11px] text-slate-600">Lead</p>
                  <p class="mt-1 truncate font-medium text-slate-300">{{ projectLeadLabel }}</p>
                </div>
                <div class="border-b border-white/[0.06] px-3 py-2.5 xl:border-b-0 xl:border-r">
                  <p class="text-[11px] text-slate-600">Priority</p>
                  <p class="mt-1 truncate font-medium text-slate-300">{{ projectPriorityLabel }}</p>
                </div>
                <div class="border-b border-white/[0.06] px-3 py-2.5 md:border-r md:border-b-0">
                  <p class="text-[11px] text-slate-600">Target date</p>
                  <p class="mt-1 truncate font-medium text-slate-300">{{ projectTargetDateLabel }}</p>
                </div>
                <div class="border-b border-white/[0.06] px-3 py-2.5 md:border-b-0 md:border-r">
                  <p class="text-[11px] text-slate-600">Issues</p>
                  <p class="mt-1 truncate font-medium text-slate-300">{{ projectIssueProgressLabel }}</p>
                </div>
                <div class="px-3 py-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-[11px] text-slate-600">Progress</p>
                    <span class="font-medium text-slate-300">{{ projectProgress }}%</span>
                  </div>
                  <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="projectProgressToneClass"
                      :style="{ width: `${projectProgress}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </header>

            <section class="mb-8">
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-xs font-medium text-slate-400">Description</h2>
                <TicketDescriptionActions
                  v-if="!isEditingDescription"
                  :copied-description="copiedDescription"
                  :show-copy="!!descriptionPlainText"
                  @copy="copyDescription"
                  @ai="showAiModal = true"
                  @edit="startEditingDescription"
                />
              </div>
              <div v-if="isEditingDescription" class="space-y-3">
                <div
                  @keydown.meta.enter.prevent="saveDescription"
                  @keydown.ctrl.enter.prevent="saveDescription"
                  @keydown.esc.prevent="cancelEditingDescription"
                >
                  <JiraDescriptionEditor
                    ref="descriptionEditorRef"
                    v-model="descriptionDraft"
                    :disabled="anyDescriptionPending"
                    placeholder="Add a description..."
                  />
                </div>
                <div
                  v-if="descriptionHasUnsupportedContent"
                  class="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                  This description uses Jira formatting the editor does not preserve yet. Saving here will simplify it to supported rich text.
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    class="rounded-md bg-accent-indigo px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="anyDescriptionPending"
                    @click="saveDescription"
                  >
                    {{ anyDescriptionPending ? 'Saving...' : 'Save' }}
                  </button>
                  <button
                    class="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="anyDescriptionPending"
                    @click="cancelEditingDescription"
                  >
                    Cancel
                  </button>
                  <span v-if="descriptionError" class="text-xs text-rose-300">{{ descriptionError }}</span>
                </div>
              </div>
              <button
                v-else-if="!(ticket.description || ticket.descriptionAdf)"
                class="flex min-h-24 w-full items-start rounded-lg border border-dashed border-white/[0.08] px-4 py-3 text-left text-sm text-slate-600 transition hover:border-white/[0.14] hover:bg-white/[0.025] hover:text-slate-400"
                @click="startEditingDescription"
              >
                Add description...
              </button>
              <div v-else class="prose prose-invert max-w-none rounded-lg border border-transparent py-1 text-sm leading-6 text-slate-300">
                <JiraAdfRenderer v-if="ticket.descriptionAdf?.content?.length" :nodes="ticket.descriptionAdf.content" />
                <div v-else class="whitespace-pre-wrap">
                  {{ ticket.description }}
                </div>
              </div>
            </section>

            <section class="mb-8">
              <div class="mb-2 flex items-center justify-between">
                <h2 class="text-xs font-medium text-slate-400">{{ detailChildSectionLabel }}</h2>
                <button
                  type="button"
                  class="rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-200"
                  @click="emit('create-child', ticket.key)"
                >
                  {{ detailChildActionLabel }}
                </button>
              </div>
              <div v-if="childTickets.length" class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.015]">
                <button
                  v-for="child in childTickets"
                  :key="child.key"
                  class="group flex w-full items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 text-left last:border-b-0 hover:bg-white/[0.035]"
                  @click="$emit('select', child.key)"
                  @mouseenter="prefetchTicket(child.key)"
                >
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full border" :class="childStatusClass(child.statusCategory)"></span>
                  <span class="w-20 shrink-0 text-xs text-slate-500">{{ child.key }}</span>
                  <span class="min-w-0 flex-1 truncate text-sm text-slate-300 group-hover:text-slate-100">{{ child.summary }}</span>
                  <span class="hidden shrink-0 text-xs text-slate-600 md:inline">{{ child.status }}</span>
                </button>
              </div>
              <button
                v-else
                type="button"
                class="flex min-h-12 w-full items-center justify-between rounded-lg border border-dashed border-white/[0.08] px-3 py-2 text-left text-sm text-slate-600 transition hover:border-white/[0.14] hover:bg-white/[0.025] hover:text-slate-400"
                @click="emit('create-child', ticket.key)"
              >
                <span>{{ detailEmptyChildLabel }}</span>
                <span class="text-xs">{{ detailChildActionLabel }}</span>
              </button>
            </section>

            <section v-if="!isLocalTicket" class="mb-8">
              <div class="mb-4 flex items-center justify-between gap-4">
                <div class="flex min-w-0 items-center gap-2">
                  <h2 class="text-[15px] font-semibold text-slate-100">Activity</h2>
                  <span v-if="activityQuery.isFetching.value" class="text-[11px] text-slate-600">Loading...</span>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    class="text-[12px] text-slate-600 transition hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="updateWatchingMutation.isPending.value"
                    @click="toggleTicketWatching"
                  >
                    {{ detailWatchButtonLabel }}
                  </button>
                  <span v-if="detailWatchCountLabel" class="text-[12px] text-slate-700">{{ detailWatchCountLabel }}</span>
                  <div v-if="detailActivityParticipantNames.length" class="flex -space-x-1.5">
                    <span
                      v-for="name in detailActivityParticipantNames"
                      :key="name"
                      class="flex h-5 w-5 items-center justify-center rounded-full border border-surface-0 text-[9px] font-semibold"
                      :class="getAssigneeAvatarColor(name)"
                      :title="name"
                    >
                      {{ getAssigneeInitials(name) }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="watchError" class="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
                {{ watchError }}
              </div>
              <div v-if="activityQuery.isError.value" class="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
                Failed to load activity.
              </div>
              <div v-else-if="activityTimelineItems.length" class="space-y-1.5 pl-4">
                <template v-for="(activityItem, activityIndex) in activityTimelineItems" :key="`${activityItem.kind}:${activityItem.id}`">
                  <article
                    v-if="activityItem.kind === 'history'"
                    class="relative flex gap-3 py-0.5"
                  >
                    <span
                      v-if="activityTimelineItems[activityIndex + 1]?.kind === 'history'"
                      class="absolute left-[7px] top-[18px] -bottom-[8px] border-l border-white/[0.08]"
                      aria-hidden="true"
                    ></span>
                    <div
                      class="relative z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border bg-surface-0"
                      :class="getActivityHistoryMarkerClass(activityItem)"
                    >
                      <span class="h-1.5 w-1.5 rounded-full" :class="getActivityHistoryDotClass(activityItem)"></span>
                    </div>
                    <p class="min-w-0 flex-1 text-[13px] leading-5 text-slate-500">
                      {{ activityItem.body }}
                      <span v-if="formatActivityTime(activityItem.createdAt)" class="text-slate-600"> · {{ formatActivityTime(activityItem.createdAt) }}</span>
                    </p>
                  </article>

                  <article
                    v-else
                    class="-ml-4 flex gap-3 rounded-lg border border-white/[0.06] bg-white/[0.025] p-4"
                  >
                    <div
                      class="-ml-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold"
                      :class="getAssigneeAvatarColor(activityItem.author)"
                    >
                      {{ getAssigneeInitials(activityItem.author) }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="mb-1 flex flex-wrap items-baseline gap-2">
                        <span class="text-sm font-medium text-slate-200">{{ activityItem.author }}</span>
                        <span class="text-xs text-slate-600">{{ formatActivityTime(activityItem.createdAt) }}</span>
                      </div>
                      <div
                        v-if="getActivityCommentParentAuthor(activityItem)"
                        class="mb-2 inline-flex rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[11px] text-slate-500"
                      >
                        Reply to {{ getActivityCommentParentAuthor(activityItem) }}
                      </div>
                      <div class="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                        {{ activityItem.body || 'No comment body' }}
                      </div>
                    </div>
                  </article>
                </template>
              </div>
              <div v-else class="rounded-lg border border-dashed border-white/[0.08] px-4 py-3 text-sm text-slate-600">
                No activity yet.
              </div>

              <div v-if="activityComposerOpen" class="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-4">
                <textarea
                  id="detail-message"
                  ref="messageTextareaRef"
                  v-model="messageDraft"
                  class="min-h-[92px] w-full resize-none border border-transparent bg-transparent p-0 text-[15px] leading-6 text-slate-300 outline-none placeholder:text-slate-600"
                  rows="4"
                  placeholder="Leave a comment..."
                  @keydown.meta.enter.prevent="submitMessage"
                  @keydown.ctrl.enter.prevent="submitMessage"
                />
                <div class="mt-2 flex items-center justify-between gap-3">
                  <span v-if="messageError" class="min-w-0 flex-1 truncate text-xs text-rose-300">{{ messageError }}</span>
                  <span v-else class="min-w-0 flex-1"></span>
                  <span class="flex shrink-0 items-center gap-3 text-slate-600">
                    <button
                      type="button"
                      class="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md opacity-70"
                      disabled
                      aria-label="Attachments are not available yet"
                      title="Attachments are not available yet"
                    >
                      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m20 11.5-8.8 8.8a5 5 0 0 1-7.1-7.1l9.5-9.5a3.4 3.4 0 0 1 4.8 4.8l-9.6 9.6a1.8 1.8 0 0 1-2.5-2.5l8.7-8.7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-slate-400 transition hover:bg-white/[0.12] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
                      :disabled="addMessageMutation.isPending.value || !messageCanSubmit"
                      :aria-label="addMessageMutation.isPending.value ? 'Posting comment' : 'Post comment'"
                      @click="submitMessage"
                    >
                      <svg v-if="!addMessageMutation.isPending.value" class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 3.2 3.9 7.3l.9.9 2.6-2.6v7.2h1.2V5.6l2.6 2.6.9-.9L8 3.2Z" />
                      </svg>
                      <span v-else class="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent"></span>
                    </button>
                  </span>
                </div>
              </div>
              <div
                v-else
                role="button"
                tabindex="0"
                class="mt-5 flex min-h-[92px] w-full items-start justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-4 text-left transition hover:border-white/[0.1] hover:bg-white/[0.035]"
                @click="focusMessageComposer"
                @keydown.enter.prevent="focusMessageComposer"
                @keydown.space.prevent="focusMessageComposer"
              >
                <span class="text-[15px] text-slate-600">Leave a comment...</span>
                <span class="mt-auto flex shrink-0 items-center gap-3 text-slate-600">
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md opacity-70"
                    disabled
                    aria-label="Attachments are not available yet"
                    title="Attachments are not available yet"
                    @click.stop
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m20 11.5-8.8 8.8a5 5 0 0 1-7.1-7.1l9.5-9.5a3.4 3.4 0 0 1 4.8 4.8l-9.6 9.6a1.8 1.8 0 0 1-2.5-2.5l8.7-8.7" />
                    </svg>
                  </button>
                  <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-slate-400" aria-hidden="true">
                    <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 3.2 3.9 7.3l.9.9 2.6-2.6v7.2h1.2V5.6l2.6 2.6.9-.9L8 3.2Z" />
                    </svg>
                  </span>
                </span>
              </div>
            </section>
          </div>
        </main>

        <aside class="border-t border-white/[0.06] bg-white/[0.01] px-4 py-4 lg:border-l lg:border-t-0">
          <div class="sticky top-16 space-y-3">
            <div v-if="!isLocalTicket" class="flex justify-end gap-1.5">
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
                :aria-label="`Copy Jira link for ${ticket.key}`"
                title="Copy Jira link"
                @click="copyJiraUrl"
              >
                <svg v-if="!copiedUrl" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                </svg>
                <svg v-else class="h-3.5 w-3.5 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
                :aria-label="`Copy issue ID ${ticket.key}`"
                title="Copy issue ID"
                @click="copyTicketKey"
              >
                <svg v-if="!copiedKey" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                  <path stroke-linecap="round" d="M8 10h4.5M8 14h8" />
                  <circle cx="16.5" cy="10" r="1.25" fill="currentColor" stroke="none" />
                </svg>
                <svg v-else class="h-3.5 w-3.5 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>

            <section class="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4">
              <div class="mb-3 flex items-center gap-1.5 text-sm text-slate-400">
                <span>Properties</span>
                <span class="text-[10px] text-slate-600">▼</span>
              </div>

              <div class="space-y-1 text-sm">
                <div class="flex items-center rounded-md px-1 py-2">
                  <div v-if="isEditingStatus" class="min-w-0 space-y-2">
                    <select
                      id="detail-status"
                      v-model="statusDraft"
                      class="w-full rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1.5 text-xs text-slate-200 outline-none transition focus:border-white/[0.16]"
                    >
                      <option value="" disabled>Move to...</option>
                      <option
                        v-for="transition in (isLocalTicket ? localTransitionsList : (transitionsQuery.data.value ?? []))"
                        :key="transition.id"
                        :value="transition.id"
                      >
                        {{ transition.name }}
                      </option>
                    </select>
                    <div class="flex flex-wrap items-center gap-1.5">
                      <button
                        class="rounded-md bg-accent-indigo px-2 py-1 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="anyStatusPending || (!isLocalTicket && transitionsQuery.isFetching.value)"
                        @click="saveStatus"
                      >
                        {{ anyStatusPending ? '...' : 'Save' }}
                      </button>
                      <button
                        class="rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-slate-400 hover:bg-white/[0.04]"
                        :disabled="anyStatusPending"
                        @click="cancelEditingStatus"
                      >
                        Cancel
                      </button>
                      <span v-if="statusError" class="text-[11px] text-rose-300">{{ statusError }}</span>
                    </div>
                  </div>
                  <button v-else class="min-w-0 text-left" @click="startEditingStatus">
                    <span
                      class="inline-flex max-w-full items-center rounded-md px-2 py-1 text-xs font-medium"
                      :class="statusColors[ticket.statusCategory] || statusColors.indeterminate"
                    >
                      <span class="truncate">{{ ticket.status }}</span>
                    </span>
                  </button>
                </div>

                <div class="flex items-start gap-3 rounded-md px-1 py-2">
                  <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold" :class="avatarColor">
                    {{ initials }}
                  </span>
                  <div v-if="isEditingAssignee && isLocalTicket" class="min-w-0 space-y-2">
                    <input
                      id="detail-local-assignee"
                      v-model="localAssigneeDraft"
                      :list="localAssigneeDatalistId"
                      class="w-full rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1.5 text-xs text-slate-200 outline-none transition focus:border-white/[0.16]"
                      placeholder="Assignee name"
                    >
                    <datalist :id="localAssigneeDatalistId">
                      <option v-for="name in localAssigneeSuggestions" :key="name" :value="name" />
                    </datalist>
                    <div class="flex flex-wrap items-center gap-1.5">
                      <button
                        class="rounded-md bg-accent-indigo px-2 py-1 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="anyAssigneePending"
                        @click="saveAssignee"
                      >
                        {{ anyAssigneePending ? '...' : 'Save' }}
                      </button>
                      <button class="rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-slate-400 hover:bg-white/[0.04]" @click="cancelEditingAssignee">
                        Cancel
                      </button>
                    </div>
                    <span v-if="assigneeError" class="text-[11px] text-rose-300">{{ assigneeError }}</span>
                  </div>
                  <div v-else-if="isEditingAssignee" ref="assigneeComboRef" class="relative min-w-0 space-y-2">
                    <input
                      id="detail-assignee-search"
                      ref="assigneeInputRef"
                      v-model="assigneeSearch"
                      class="w-full rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1.5 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-white/[0.16]"
                      placeholder="Search assignees..."
                      @keydown="handleAssigneeKeydown"
                    />
                    <div class="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-white/[0.08] bg-surface-2 py-1 shadow-xl shadow-black/40">
                      <template v-if="recentComboOptions.length">
                        <div class="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">Recent</div>
                        <button
                          v-for="(option, i) in recentComboOptions"
                          :key="option.accountId"
                          :data-idx="i"
                          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
                          :class="assigneeHighlightIndex === i ? 'bg-white/[0.08] text-slate-100' : 'text-slate-300 hover:bg-white/[0.04]'"
                          @click="selectAssigneeOption(option.accountId)"
                          @mouseenter="assigneeHighlightIndex = i"
                        >
                          {{ option.displayName }}
                        </button>
                        <div class="mx-2 my-1 border-t border-white/[0.06]"></div>
                      </template>
                      <button
                        v-for="(option, j) in nonRecentComboOptions"
                        :key="option.accountId"
                        :data-idx="recentComboOptions.length + j"
                        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
                        :class="assigneeHighlightIndex === recentComboOptions.length + j ? 'bg-white/[0.08] text-slate-100' : 'text-slate-300 hover:bg-white/[0.04]'"
                        @click="selectAssigneeOption(option.accountId)"
                        @mouseenter="assigneeHighlightIndex = recentComboOptions.length + j"
                      >
                        {{ option.displayName }}
                      </button>
                      <div v-if="!flatComboOptions.length" class="px-3 py-2 text-xs italic text-slate-600">
                        No matching users
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button class="rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-slate-400 hover:bg-white/[0.04]" @click="cancelEditingAssignee">
                        Cancel
                      </button>
                      <span v-if="assignableUsersQuery.isFetching.value" class="text-[11px] text-slate-500">Loading...</span>
                      <span v-if="assigneeError" class="text-[11px] text-rose-300">{{ assigneeError }}</span>
                    </div>
                  </div>
                  <button v-else class="flex min-w-0 items-center gap-2 text-left" @click="startEditingAssignee">
                    <span class="min-w-0 truncate text-sm text-slate-300">{{ ticket.assignee || 'Unassigned' }}</span>
                  </button>
                </div>

                <div class="flex items-start rounded-md px-1 py-2">
                  <div v-if="isEditingPriority" class="min-w-0 space-y-2">
                    <select
                      id="detail-priority"
                      v-if="!isLocalTicket"
                      v-model="priorityDraft"
                      class="w-full rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1.5 text-xs text-slate-200 outline-none transition focus:border-white/[0.16]"
                    >
                      <option value="" disabled>Set priority...</option>
                      <option v-for="priority in prioritiesQuery.data.value ?? []" :key="priority.id" :value="priority.id">
                        {{ priority.name }}
                      </option>
                    </select>
                    <select
                      id="detail-local-priority"
                      v-else
                      v-model="priorityDraftLocal"
                      class="w-full rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1.5 text-xs text-slate-200 outline-none transition focus:border-white/[0.16]"
                    >
                      <option v-for="p in LOCAL_PRIORITY_NAMES" :key="p" :value="p">
                        {{ p }}
                      </option>
                    </select>
                    <div class="flex flex-wrap items-center gap-1.5">
                      <button
                        class="rounded-md bg-accent-indigo px-2 py-1 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="anyPriorityPending || (!isLocalTicket && prioritiesQuery.isFetching.value)"
                        @click="savePriority"
                      >
                        {{ anyPriorityPending ? '...' : 'Save' }}
                      </button>
                      <button class="rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-slate-400 hover:bg-white/[0.04]" :disabled="anyPriorityPending" @click="cancelEditingPriority">
                        Cancel
                      </button>
                      <span v-if="priorityError" class="text-[11px] text-rose-300">{{ priorityError }}</span>
                    </div>
                  </div>
                  <button v-else class="flex min-w-0 items-center gap-2 text-left" @click="startEditingPriority">
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="priorityConfig[ticket.priority]?.bg || 'bg-slate-500'"></span>
                    <span class="truncate text-sm text-slate-300">{{ ticket.priority }}</span>
                  </button>
                </div>
              </div>
            </section>

            <section v-if="!isProjectDetail" class="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4">
              <div class="mb-3 flex items-center gap-1.5 text-sm text-slate-400">
                <span>Project</span>
                <span class="text-[10px] text-slate-600">▼</span>
              </div>

              <button
                v-if="detailProjectParent"
                type="button"
                class="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-left transition hover:bg-white/[0.04]"
                @click="$emit('select', detailProjectParent.key)"
                @mouseenter="prefetchTicket(detailProjectParent.key)"
              >
                <span class="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                  <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M12.8 1.6c-2.4.2-4.3 1.1-5.7 2.6L4.5 6.8 2.6 6.4 1.2 7.8l2.5 1.1 1.1 2.5 1.4-1.4-.4-1.9 2.6-2.6c1.5-1.4 2.4-3.3 2.6-5.7h-.2Zm-1.9 2.7a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0ZM3.9 11.3c-.9.2-1.5.6-1.9 1.1-.5.6-.7 1.3-.8 2.1.8-.1 1.5-.3 2.1-.8.5-.4.9-1 1.1-1.9l-.5-.5Z" />
                  </svg>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-slate-200">{{ detailProjectParentLabel }}</span>
                </span>
              </button>
              <button
                v-else
                type="button"
                class="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-left text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
              >
                <span class="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
                  <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                    <path stroke-linejoin="round" d="m8 1.8 5.2 3v6L8 13.8l-5.2-3v-6L8 1.8Z" />
                    <path stroke-linejoin="round" d="M2.9 4.9 8 7.8l5.1-2.9M8 7.8v5.8" />
                  </svg>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">Add to project</span>
                </span>
              </button>
            </section>

            <section class="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4">
              <div class="mb-3 flex items-center gap-1.5 text-sm text-slate-400">
                <span>Jira</span>
                <span class="text-[10px] text-slate-600">▼</span>
              </div>

              <div class="space-y-2 text-sm">
                <div
                  v-if="detailJiraTypeLabel"
                  class="flex items-center"
                >
                  <span class="inline-flex max-w-full justify-self-start rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-xs font-medium text-slate-400">
                    <span class="truncate">{{ detailJiraTypeLabel }}</span>
                  </span>
                </div>
                <a
                  v-if="!isLocalTicket"
                  :href="jiraUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex h-7 items-center rounded-md border border-white/[0.08] px-2.5 text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
                >
                  Open in Jira
                </a>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>

    <div
      v-else-if="detailQueryError"
      class="flex items-center justify-center py-20 text-sm text-rose-300"
    >
      Failed to load ticket details.
    </div>

    <div v-else class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-accent-indigo"></div>
        <span class="text-xs text-slate-600">Loading ticket</span>
      </div>
    </div>

    <AiDescriptionModal
      :open="showAiModal"
      :current-description="ticket?.description ?? ''"
      :current-description-adf="ticket?.descriptionAdf ?? null"
      :ticket-key="ticket?.key ?? ''"
      :ticket-title="ticket?.summary ?? ''"
      :is-saving="anyDescriptionPending"
      @close="showAiModal = false"
      @confirm="handleAiDescriptionConfirm"
    />
  </div>
</template>
