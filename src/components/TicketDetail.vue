<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useJiraTicket, ticketQueryKey } from '@/composables/useJiraTicket'
import { useAssignableUsers } from '@/composables/useAssignableUsers'
import { usePriorities } from '@/composables/usePriorities'
import { useTransitions } from '@/composables/useTransitions'
import { useJiraMessages } from '@/composables/useJiraMessages'
import { useAddTicketMessage } from '@/composables/useAddTicketMessage'
import { useUpdateTicketAssignee } from '@/composables/useUpdateTicketAssignee'
import { useUpdateTicketPriority } from '@/composables/useUpdateTicketPriority'
import { useUpdateTicketTitle } from '@/composables/useUpdateTicketTitle'
import { useUpdateTicketStatus } from '@/composables/useUpdateTicketStatus'
import { useUpdateTicketDescription } from '@/composables/useUpdateTicketDescription'
import { fetchTicket } from '@/api/jira'
import JiraAdfRenderer from '@/components/JiraAdfRenderer.vue'
import type { JiraTicket } from '@/types/jira'

const props = withDefaults(defineProps<{
  ticketKey: string | null
  mode?: 'inline' | 'panel'
}>(), {
  mode: 'inline',
})
const emit = defineEmits<{
  close: []
  select: [key: string]
  'create-child': [parentKey: string]
}>()

const ticketKey = computed(() => props.ticketKey)
const ticketQuery = useJiraTicket(ticketKey)
const assignableUsersQuery = useAssignableUsers(ticketKey)
const prioritiesQuery = usePriorities()
const transitionsQuery = useTransitions(ticketKey)
const messagesQuery = useJiraMessages(ticketKey)
const updateTitleMutation = useUpdateTicketTitle()
const updateAssigneeMutation = useUpdateTicketAssignee()
const updatePriorityMutation = useUpdateTicketPriority()
const updateStatusMutation = useUpdateTicketStatus()
const updateDescriptionMutation = useUpdateTicketDescription()
const addMessageMutation = useAddTicketMessage()
const queryClient = useQueryClient()

const cachedTicket = computed<JiraTicket | null>(() => {
  const key = ticketKey.value
  if (!key) return null

  const tickets = queryClient.getQueryData<JiraTicket[]>(['tickets'])
  return tickets?.find((ticket) => ticket.key === key) ?? null
})

const ticket = computed(() => ticketQuery.data.value ?? cachedTicket.value)

const statusColors: Record<string, string> = {
  new: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20',
  indeterminate: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
  done: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
}

const issueType = computed(() => ticket.value?.issueType?.toLowerCase() || 'task')

const badgeClass = computed(() => {
  const type = issueType.value
  if (type.includes('epic')) return 'issue-badge-epic'
  if (type.includes('bug')) return 'issue-badge-bug'
  if (type.includes('story')) return 'issue-badge-story'
  if (type.includes('sub')) return 'issue-badge-subtask'
  return 'issue-badge-task'
})

const priorityConfig: Record<string, { color: string; bg: string }> = {
  Highest: { color: 'text-red-400', bg: 'bg-red-400' },
  High: { color: 'text-orange-400', bg: 'bg-orange-400' },
  Medium: { color: 'text-yellow-400', bg: 'bg-yellow-400' },
  Low: { color: 'text-sky-400', bg: 'bg-sky-400' },
  Lowest: { color: 'text-slate-400', bg: 'bg-slate-400' },
}

const avatarColors = [
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/20',
  'bg-amber-500/20 text-amber-300 border-amber-500/20',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/20',
  'bg-rose-500/20 text-rose-300 border-rose-500/20',
  'bg-sky-500/20 text-sky-300 border-sky-500/20',
]

const avatarColor = computed(() => {
  if (!ticket.value?.assignee || ticket.value.assignee === 'Unassigned') return 'bg-slate-500/15 text-slate-400 border-slate-500/15'
  const hash = ticket.value.assignee.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return avatarColors[hash % avatarColors.length]
})

const initials = computed(() => {
  const name = ticket.value?.assignee
  if (!name || name === 'Unassigned') return '?'
  const parts = name.split(/\s+/)
  if (parts.length >= 2) return parts[0][0] + parts[1][0]
  return name.slice(0, 2)
})

const childTickets = computed<JiraTicket[]>(() => {
  const key = ticketKey.value
  if (!key) return []
  const allTickets = queryClient.getQueryData<JiraTicket[]>(['tickets'])
  if (!allTickets) return []
  return allTickets.filter((t) => t.parent?.key === key)
})

function childBadgeClass(type: string) {
  const t = type.toLowerCase()
  if (t.includes('epic')) return 'issue-badge-epic'
  if (t.includes('bug')) return 'issue-badge-bug'
  if (t.includes('story')) return 'issue-badge-story'
  if (t.includes('sub')) return 'issue-badge-subtask'
  return 'issue-badge-task'
}

function childStatusClass(category: string) {
  return statusColors[category] || statusColors.indeterminate
}

const copiedKey = ref(false)
const copiedUrl = ref(false)
const isEditingTitle = ref(false)
const titleDraft = ref('')
const titleError = ref<string | null>(null)
const isEditingDescription = ref(false)
const descriptionDraft = ref('')
const descriptionError = ref<string | null>(null)
const descriptionTextareaRef = ref<HTMLTextAreaElement | null>(null)
const messageDraft = ref('')
const messageError = ref<string | null>(null)
const messageTextareaRef = ref<HTMLTextAreaElement | null>(null)
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
const recentAssigneeIds = ref<string[]>(JSON.parse(localStorage.getItem(RECENT_ASSIGNEES_KEY) ?? '[]'))

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
  if (assigneeComboRef.value && !assigneeComboRef.value.contains(e.target as Node)) {
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

const ticketDateFields = computed(() => [
  { key: 'created', label: 'Created', value: ticket.value?.createdAt, icon: '📅' },
  { key: 'updated', label: 'Modified', value: ticket.value?.updatedAt, icon: '✏️' },
  { key: 'due', label: 'Due', value: ticket.value?.dueDate, icon: '⏰' },
  { key: 'completed', label: 'Completed', value: ticket.value?.completedAt, icon: '✅' },
])

const messages = computed(() => messagesQuery.data.value ?? [])

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

async function copyTicketKey() {
  if (!ticket.value) return
  await navigator.clipboard.writeText(ticket.value.key)
  copiedKey.value = true
  setTimeout(() => { copiedKey.value = false }, 1500)
}

async function copyJiraUrl() {
  if (!jiraUrl.value) return
  await navigator.clipboard.writeText(jiraUrl.value)
  copiedUrl.value = true
  setTimeout(() => { copiedUrl.value = false }, 1500)
}

function prefetchTicket(key: string) {
  queryClient.prefetchQuery({
    queryKey: ticketQueryKey(key),
    queryFn: () => fetchTicket(key),
  })
}

watch(ticket, (nextTicket) => {
  titleDraft.value = nextTicket?.summary ?? ''
  titleError.value = null
  isEditingTitle.value = false
  assigneeDraft.value = nextTicket?.assigneeAccountId ?? '__unassigned__'
  assigneeError.value = null
  isEditingAssignee.value = false
  priorityDraft.value = ''
  priorityError.value = null
  isEditingPriority.value = false
  statusDraft.value = ''
  statusError.value = null
  isEditingStatus.value = false
  descriptionDraft.value = nextTicket?.description ?? ''
  descriptionError.value = null
  isEditingDescription.value = false
  messageDraft.value = ''
  messageError.value = null
}, { immediate: true })

function startEditingDescription() {
  if (!ticket.value || updateDescriptionMutation.isPending.value) return
  descriptionDraft.value = ticket.value.description ?? ''
  descriptionError.value = null
  isEditingDescription.value = true
  nextTick(() => {
    descriptionTextareaRef.value?.focus()
  })
}

function cancelEditingDescription() {
  descriptionDraft.value = ticket.value?.description ?? ''
  descriptionError.value = null
  isEditingDescription.value = false
}

async function saveDescription() {
  if (!ticket.value || updateDescriptionMutation.isPending.value) return

  const nextDescription = descriptionDraft.value.trim()

  if (nextDescription === (ticket.value.description ?? '').trim()) {
    isEditingDescription.value = false
    descriptionError.value = null
    return
  }

  try {
    await updateDescriptionMutation.mutateAsync({ key: ticket.value.key, description: nextDescription })
    isEditingDescription.value = false
    descriptionError.value = null
  } catch (err) {
    descriptionError.value = err instanceof Error ? err.message : 'Failed to update description.'
  }
}

function onDescriptionKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && event.metaKey) {
    event.preventDefault()
    void saveDescription()
  }
}

function startEditingTitle() {
  if (!ticket.value || updateTitleMutation.isPending.value) return
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
  if (!ticket.value || updateTitleMutation.isPending.value) return

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
    await updateTitleMutation.mutateAsync({ key: ticket.value.key, title: nextTitle })
    isEditingTitle.value = false
    titleError.value = null
  } catch (err) {
    titleError.value = err instanceof Error ? err.message : 'Failed to update title.'
  }
}

async function startEditingAssignee() {
  if (!ticket.value || updateAssigneeMutation.isPending.value) return
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
  assigneeDraft.value = ticket.value?.assigneeAccountId ?? '__unassigned__'
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
  if (!ticket.value || updateAssigneeMutation.isPending.value) return

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
  if (!ticket.value || updateStatusMutation.isPending.value) return
  statusDraft.value = ''
  statusError.value = null
  isEditingStatus.value = true

  if (!transitionsQuery.data.value && !transitionsQuery.isFetching.value) {
    try {
      await transitionsQuery.refetch()
    } catch {
      statusError.value = 'Failed to load transitions.'
    }
  }
}

async function startEditingPriority() {
  if (!ticket.value || updatePriorityMutation.isPending.value) return
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
  priorityError.value = null
  isEditingPriority.value = false
}

async function savePriority() {
  if (!ticket.value || updatePriorityMutation.isPending.value) return

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
  if (!ticket.value || updateStatusMutation.isPending.value) return

  if (!statusDraft.value) {
    statusError.value = 'Select a status.'
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
    messageError.value = 'Message cannot be empty.'
    return
  }

  try {
    await addMessageMutation.mutateAsync({
      key: ticket.value.key,
      body: nextMessage,
    })
    messageDraft.value = ''
    messageError.value = null
    nextTick(() => {
      messageTextareaRef.value?.focus()
    })
  } catch (err) {
    messageError.value = err instanceof Error ? err.message : 'Failed to add message.'
  }
}
</script>

<template>
  <!-- Inline mode: renders in-place in main content area -->
  <div v-if="ticketKey && mode === 'inline'">
    <!-- Content -->
    <div v-if="ticket" class="animate-fade-in">
      <!-- Ticket header -->
      <div class="mb-8">
        <!-- Parent breadcrumb (above heading) -->
        <div class="mb-2 flex h-4 items-center">
          <button
            v-if="ticket.parent"
            class="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors group"
            @click="$emit('select', ticket.parent.key)"
            @mouseenter="prefetchTicket(ticket.parent.key)"
          >
            <svg class="w-3 h-3 opacity-60 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            <span class="font-medium font-body">{{ ticket.parent.key }}</span>
            <span class="text-slate-600">·</span>
            <span class="text-slate-600 uppercase tracking-wide text-[10px] font-semibold">{{ ticket.parent.issueType }}</span>
            <span class="text-slate-600">·</span>
            <span class="truncate max-w-xs font-body">{{ ticket.parent.summary }}</span>
          </button>
          <span
            v-else
            aria-hidden="true"
            class="invisible flex items-center gap-1.5 text-xs"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            <span class="font-medium font-body">PARENT-000</span>
            <span>·</span>
            <span class="uppercase tracking-wide text-[10px] font-semibold">Story</span>
            <span>·</span>
            <span>Placeholder</span>
          </span>
        </div>
        <div class="flex items-center gap-3 mb-4">
          <span class="inline-flex items-center gap-1.5">
            <span class="text-sm font-medium text-slate-500 tracking-wide font-body">{{ ticket.key }}</span>
            <button
              class="relative group/copy inline-flex items-center justify-center w-5 h-5 rounded text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
              @click="copyTicketKey"
            >
              <!-- Copy icon -->
              <svg v-if="!copiedKey" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              <!-- Check icon -->
              <svg v-else class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <!-- Tooltip -->
              <span
                class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 transition-opacity"
                :class="copiedKey ? 'opacity-100' : 'group-hover/copy:opacity-100'"
              >
                {{ copiedKey ? 'Copied!' : 'Copy ID' }}
              </span>
            </button>
          </span>
          <span
            class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
            :class="badgeClass"
          >
            {{ ticket.issueType }}
          </span>
          <!-- Priority -->
          <div class="group relative flex items-center gap-1.5">
            <div v-if="isEditingPriority" class="flex items-center gap-2">
              <select
                v-model="priorityDraft"
                class="rounded-full border border-white/[0.08] bg-slate-950 px-3 py-1 text-xs text-slate-200 outline-none transition focus:border-indigo-400"
              >
                <option value="" disabled>Set priority...</option>
                <option
                  v-for="priority in prioritiesQuery.data.value ?? []"
                  :key="priority.id"
                  :value="priority.id"
                >
                  {{ priority.name }}
                </option>
              </select>
              <button
                class="rounded-full bg-indigo-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="updatePriorityMutation.isPending.value || prioritiesQuery.isFetching.value"
                @click="savePriority"
              >
                {{ updatePriorityMutation.isPending.value ? '...' : 'Save' }}
              </button>
              <button
                class="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="updatePriorityMutation.isPending.value"
                @click="cancelEditingPriority"
              >
                ✕
              </button>
              <span v-if="prioritiesQuery.isFetching.value" class="text-[11px] text-slate-500">Loading...</span>
              <span v-if="priorityError" class="text-[11px] text-rose-300">{{ priorityError }}</span>
            </div>
            <button
              v-else
              class="flex items-center gap-1.5 cursor-pointer rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 transition hover:border-white/[0.1] hover:bg-white/[0.04]"
              @click="startEditingPriority"
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                :class="priorityConfig[ticket.priority]?.bg || 'bg-slate-500'"
              ></span>
              <span class="text-[11px] font-medium text-slate-400">{{ ticket.priority }}</span>
            </button>
          </div>
          <!-- Assignee -->
          <div class="group relative flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] py-1 pl-1.5 pr-2.5 transition hover:border-white/[0.1] hover:bg-white/[0.04]">
            <div v-if="isEditingAssignee" ref="assigneeComboRef" class="relative">
              <div class="flex items-center gap-2">
                <div class="relative">
                  <svg class="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    ref="assigneeInputRef"
                    v-model="assigneeSearch"
                    class="w-48 rounded-lg border border-white/[0.08] bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-indigo-400"
                    placeholder="Search assignees..."
                    @keydown="handleAssigneeKeydown"
                  />
                </div>
                <button
                  class="rounded-full border border-white/[0.08] px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/[0.04]"
                  @click="cancelEditingAssignee"
                >
                  ✕
                </button>
                <span v-if="assignableUsersQuery.isFetching.value" class="text-[11px] text-slate-500">Loading...</span>
                <span v-if="assigneeError" class="text-[11px] text-rose-300">{{ assigneeError }}</span>
              </div>
              <!-- Dropdown list -->
              <div class="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-white/[0.08] bg-slate-950 py-1 shadow-xl shadow-black/40">
                <!-- Recent section -->
                <template v-if="recentComboOptions.length">
                  <div class="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-600 font-medium">Recent</div>
                  <button
                    v-for="(option, i) in recentComboOptions"
                    :key="option.accountId"
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
                <!-- All users section -->
                <template v-if="nonRecentComboOptions.length">
                  <button
                    v-for="(option, j) in nonRecentComboOptions"
                    :key="option.accountId"
                    :data-idx="recentComboOptions.length + j"
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
                    :class="assigneeHighlightIndex === recentComboOptions.length + j ? 'bg-indigo-500/20 text-white' : 'text-slate-300 hover:bg-white/[0.04]'"
                    @click="selectAssigneeOption(option.accountId)"
                    @mouseenter="assigneeHighlightIndex = recentComboOptions.length + j"
                  >
                    {{ option.displayName }}
                  </button>
                </template>
                <!-- No results -->
                <div v-if="!flatComboOptions.length" class="px-3 py-2 text-xs text-slate-600 italic">
                  No matching users
                </div>
              </div>
            </div>
            <button v-else class="flex items-center gap-1.5 cursor-pointer" @click="startEditingAssignee">
              <div
                class="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold border"
                :class="avatarColor"
              >
                {{ initials }}
              </div>
              <span class="text-[11px] font-medium text-slate-300">{{ ticket.assignee || 'Unassigned' }}</span>
            </button>
          </div>
          <!-- Status -->
          <div class="group relative flex items-center gap-1.5">
            <div v-if="isEditingStatus" class="flex items-center gap-2">
              <select
                v-model="statusDraft"
                class="rounded-full border border-white/[0.08] bg-slate-950 px-3 py-1 text-xs text-slate-200 outline-none transition focus:border-indigo-400"
              >
                <option value="" disabled>Move to...</option>
                <option
                  v-for="transition in transitionsQuery.data.value ?? []"
                  :key="transition.id"
                  :value="transition.id"
                >
                  {{ transition.name }}
                </option>
              </select>
              <button
                class="rounded-full bg-indigo-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="updateStatusMutation.isPending.value || transitionsQuery.isFetching.value"
                @click="saveStatus"
              >
                {{ updateStatusMutation.isPending.value ? '...' : 'Save' }}
              </button>
              <button
                class="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="updateStatusMutation.isPending.value"
                @click="cancelEditingStatus"
              >
                ✕
              </button>
              <span v-if="transitionsQuery.isFetching.value" class="text-[11px] text-slate-500">Loading...</span>
              <span v-if="statusError" class="text-[11px] text-rose-300">{{ statusError }}</span>
            </div>
            <button v-else class="flex items-center cursor-pointer" @click="startEditingStatus">
              <span
                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                :class="statusColors[ticket.statusCategory] || statusColors.indeterminate"
              >
                {{ ticket.status }}
              </span>
            </button>
          </div>

          <!-- Jira link + copy URL -->
          <span class="ml-auto flex items-center gap-1">
            <a
              :href="jiraUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 hover:text-rose-200 transition-colors"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 3h6v6" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 14L21 3" />
              </svg>
              Open in Jira
            </a>
            <button
              class="relative group/copyurl inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-colors"
              @click="copyJiraUrl"
            >
              <!-- Link icon -->
              <svg v-if="!copiedUrl" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
              <!-- Check icon -->
              <svg v-else class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <!-- Tooltip -->
              <span
                class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 transition-opacity"
                :class="copiedUrl ? 'opacity-100' : 'group-hover/copyurl:opacity-100'"
              >
                {{ copiedUrl ? 'Copied!' : 'Copy link' }}
              </span>
            </button>
          </span>
        </div>
      <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div v-if="isEditingTitle" class="space-y-2">
              <input
                v-model="titleDraft"
                class="w-full rounded-xl border border-indigo-500/30 bg-white/[0.04] px-4 py-3 text-2xl text-white outline-none transition focus:border-indigo-400 focus:bg-white/[0.06]"
                maxlength="255"
                placeholder="Ticket title"
                @keydown.enter.prevent="saveTitle"
                @keydown.esc.prevent="cancelEditingTitle"
              />
              <div class="flex items-center gap-2">
                <button
                  class="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="updateTitleMutation.isPending.value"
                  @click="saveTitle"
                >
                  {{ updateTitleMutation.isPending.value ? 'Saving...' : 'Save' }}
                </button>
                <button
                  class="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="updateTitleMutation.isPending.value"
                  @click="cancelEditingTitle"
                >
                  Cancel
                </button>
                <span v-if="titleError" class="text-xs text-rose-300">{{ titleError }}</span>
              </div>
            </div>
            <div v-else class="flex items-start justify-between gap-3">
              <h2 class="min-w-0 flex-1 font-display text-3xl leading-tight text-white">{{ ticket.summary }}</h2>
              <button
                class="relative group/edit mt-1 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
                @click="startEditingTitle"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
                <span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 transition-opacity group-hover/edit:opacity-100">
                  Edit title
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="mb-6 flex flex-wrap items-end gap-x-5 gap-y-2 text-[12px]">
        <div v-for="field in ticketDateFields" :key="field.key" class="flex flex-col">
          <span class="text-[10px] uppercase tracking-[0.08em] text-slate-600 font-medium">{{ field.label }}</span>
          <template v-if="formatDateParts(field.value)">
            <span class="mt-0.5 flex items-baseline gap-1.5"><span class="text-slate-400">{{ formatDateParts(field.value)!.date }}</span><span v-if="formatDateParts(field.value)!.time" class="text-slate-600">{{ formatDateParts(field.value)!.time }}</span></span>
          </template>
          <span v-else class="mt-0.5 text-slate-700">—</span>
        </div>
        <button
          v-if="ticket"
          type="button"
          class="ml-auto rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/20 hover:text-emerald-200"
          @click="emit('create-child', ticket.key)"
        >
          + Add Child
        </button>
      </div>

      <!-- Description -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium">Description</h4>
          <button
            v-if="!isEditingDescription"
            class="relative group/edit-desc shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
            @click="startEditingDescription"
          >
            <svg class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            <span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 transition-opacity group-hover/edit-desc:opacity-100">
              Edit description
            </span>
          </button>
        </div>
        <div v-if="isEditingDescription" class="space-y-2">
          <textarea
            ref="descriptionTextareaRef"
            v-model="descriptionDraft"
            class="w-full rounded-xl border border-indigo-500/30 bg-white/[0.04] px-4 py-3 text-sm text-slate-300 outline-none transition focus:border-indigo-400 focus:bg-white/[0.06] leading-relaxed font-body resize-y min-h-[240px]"
            rows="12"
            placeholder="Add a description..."
            @keydown="onDescriptionKeydown"
            @keydown.esc.prevent="cancelEditingDescription"
          />
          <div class="flex items-center gap-2">
            <button
              class="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="updateDescriptionMutation.isPending.value"
              @click="saveDescription"
            >
              {{ updateDescriptionMutation.isPending.value ? 'Saving...' : 'Save' }}
            </button>
            <button
              class="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="updateDescriptionMutation.isPending.value"
              @click="cancelEditingDescription"
            >
              Cancel
            </button>
            <span v-if="descriptionError" class="text-xs text-rose-300">{{ descriptionError }}</span>
          </div>
        </div>
        <div v-else class="space-y-3">
          <div
            v-if="ticket.description || ticket.descriptionAdf"
            class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 font-body"
          >
            <JiraAdfRenderer v-if="ticket.descriptionAdf?.content?.length" :nodes="ticket.descriptionAdf.content" />
            <div v-else class="whitespace-pre-wrap text-sm text-slate-400 leading-relaxed">
              {{ ticket.description }}
            </div>
          </div>
          <div
            v-else
            class="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm italic text-slate-600 font-body"
          >
            No description provided.
          </div>
          <div class="flex justify-end">
            <button
              class="relative group/edit-desc-bottom inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
              @click="startEditingDescription"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              <span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 transition-opacity group-hover/edit-desc-bottom:opacity-100">
                Edit description
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div class="mb-8">
        <div class="mb-3 flex items-center justify-between">
          <h4 class="text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium">
            Messages
            <span class="ml-1 text-slate-700">{{ messages.length }}</span>
          </h4>
          <span v-if="messagesQuery.isFetching.value" class="text-[11px] text-slate-600">Loading...</span>
        </div>

        <div class="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <textarea
            ref="messageTextareaRef"
            v-model="messageDraft"
            class="min-h-[110px] w-full resize-y rounded-xl border border-white/[0.08] bg-slate-950/60 px-4 py-3 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-indigo-400"
            rows="4"
            placeholder="Add a new message..."
            @keydown.meta.enter.prevent="submitMessage"
            @keydown.ctrl.enter.prevent="submitMessage"
          />
          <div class="mt-3 flex items-center gap-2">
            <button
              class="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="addMessageMutation.isPending.value"
              @click="submitMessage"
            >
              {{ addMessageMutation.isPending.value ? 'Posting...' : 'Post message' }}
            </button>
            <span class="text-[11px] text-slate-600">Cmd/Ctrl+Enter to post</span>
            <span v-if="messageError" class="text-xs text-rose-300">{{ messageError }}</span>
          </div>
        </div>

        <div v-if="messagesQuery.isError.value" class="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          Failed to load messages.
        </div>
        <div v-else-if="messages.length" class="space-y-3">
          <article
            v-for="message in messages"
            :key="message.id"
            class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
          >
            <div class="mb-2 flex items-center justify-between gap-3">
              <span class="text-sm font-medium text-slate-200">{{ message.author }}</span>
              <span class="text-[11px] text-slate-600">{{ formatDateParts(message.createdAt)?.date }}<template v-if="formatDateParts(message.createdAt)?.time"> · {{ formatDateParts(message.createdAt)?.time }}</template></span>
            </div>
            <div class="whitespace-pre-wrap text-sm leading-relaxed text-slate-400 font-body">
              {{ message.body || 'No message body' }}
            </div>
          </article>
        </div>
        <div v-else class="text-sm italic text-slate-600 font-body">No messages yet.</div>
      </div>

      <!-- Child tickets -->
      <div v-if="childTickets.length" class="mb-8">
        <h4 class="mb-3 text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium">
          Child Tickets
          <span class="ml-1 text-slate-700">{{ childTickets.length }}</span>
        </h4>
        <div class="rounded-xl bg-white/[0.03] border border-white/[0.06] divide-y divide-white/[0.06]">
          <button
            v-for="child in childTickets"
            :key="child.key"
            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors group first:rounded-t-xl last:rounded-b-xl"
            @click="$emit('select', child.key)"
            @mouseenter="prefetchTicket(child.key)"
          >
            <span class="text-xs font-medium text-slate-500 font-body shrink-0 w-24">{{ child.key }}</span>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase"
              :class="childBadgeClass(child.issueType)"
            >
              {{ child.issueType }}
            </span>
            <span class="text-sm text-slate-400 group-hover:text-slate-300 transition-colors truncate font-body">{{ child.summary }}</span>
            <span
              class="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
              :class="childStatusClass(child.statusCategory)"
            >
              {{ child.status }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Error (only when no data at all) -->
    <div
      v-else-if="ticketQuery.isError.value"
      class="flex items-center justify-center py-20 text-sm text-rose-300 font-body"
    >
      Failed to load ticket details.
    </div>

    <!-- Loading -->
    <div v-else class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400"></div>
        <span class="text-xs text-slate-600 font-body">Loading ticket</span>
      </div>
    </div>
  </div>
</template>
