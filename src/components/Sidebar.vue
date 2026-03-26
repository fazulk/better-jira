<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { getStatusGroup, type JiraTicket } from '@/types/jira'

const props = defineProps<{
  tickets: JiraTicket[]
  selectedKey: string | null
  collapsed: boolean
  refreshing: boolean
}>()

const emit = defineEmits<{
  select: [key: string]
  prefetch: [key: string]
  'toggle-collapse': []
  refresh: []
  home: []
}>()

// --- State ---
const storedExpandedNodeKeys = useLocalStorage<string[]>('jira2.sidebar.expandedNodes', [])
const expandedNodes = computed(() => new Set(storedExpandedNodeKeys.value))
const preSearchExpandedNodes = ref<Set<string> | null>(null)
const searchQuery = ref('')
const showFilters = ref(false)
const showParentContext = useLocalStorage('jira2.sidebar.showParentContext', true)
const filterType = useLocalStorage<string | null>('jira2.sidebar.filterType', null)
const filterStatus = useLocalStorage<string | null>('jira2.sidebar.filterStatus', null)
const filterAssignees = useLocalStorage<string[]>('jira2.sidebar.filterAssignees', [])

const sortOptions = [
  { value: 'key', label: 'Key' },
  { value: 'summary', label: 'Summary' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'type', label: 'Type' },
  { value: 'createdAt', label: 'Created date' },
  { value: 'updatedAt', label: 'Updated date' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'completedAt', label: 'Completed date' },
] as const

const groupOptions = [
  { value: 'hierarchy', label: 'Hierarchy' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'type', label: 'Type' },
  { value: 'createdAt', label: 'Created date' },
  { value: 'updatedAt', label: 'Updated date' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'completedAt', label: 'Completed date' },
  { value: 'none', label: 'None' },
] as const

type SortOption = (typeof sortOptions)[number]['value']
type GroupOption = (typeof groupOptions)[number]['value']

const sortBy = useLocalStorage<SortOption>('jira2.sidebar.sortBy', 'key')
const groupBy = useLocalStorage<GroupOption>('jira2.sidebar.groupBy', 'hierarchy')

function isSortOption(value: unknown): value is SortOption {
  return sortOptions.some(option => option.value === value)
}

function isGroupOption(value: unknown): value is GroupOption {
  return groupOptions.some(option => option.value === value)
}

if (!isSortOption(sortBy.value)) {
  sortBy.value = 'key'
}

if (!isGroupOption(groupBy.value)) {
  groupBy.value = 'hierarchy'
}

// --- Fuzzy search ---
function fuzzyMatch(text: string, query: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 }
  const lower = text.toLowerCase()
  const q = query.toLowerCase()

  // Exact substring match (highest score)
  if (lower.includes(q)) return { match: true, score: 100 }

  // Fuzzy: every character in query appears in order in text
  let qi = 0
  let score = 0
  let lastIdx = -1
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      // Bonus for consecutive chars
      score += (lastIdx === i - 1) ? 10 : 5
      // Bonus for matching at word start
      if (i === 0 || lower[i - 1] === ' ' || lower[i - 1] === '-' || lower[i - 1] === '[' || lower[i - 1] === '_') {
        score += 8
      }
      lastIdx = i
      qi++
    }
  }

  if (qi === q.length) return { match: true, score }
  return { match: false, score: 0 }
}

function ticketMatchesSearch(ticket: JiraTicket, query: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 }
  const fields = [
    ticket.key,
    ticket.summary,
    ticket.assignee,
    ticket.issueType,
    ticket.status,
    ticket.parent?.key,
    ticket.parent?.summary,
  ].filter((field): field is string => Boolean(field))

  let bestScore = 0
  let matched = false
  for (const field of fields) {
    const result = fuzzyMatch(field, query)
    if (result.match) {
      matched = true
      bestScore = Math.max(bestScore, result.score)
    }
  }
  return { match: matched, score: bestScore }
}

// --- Filter options ---
const issueTypes = computed(() => [...new Set(props.tickets.map(t => t.issueType).filter(Boolean))].sort())
const statuses = computed(() => [...new Set(props.tickets.map(t => t.status).filter(Boolean))].sort())
const assignees = computed(() => [...new Set(props.tickets.map(t => t.assignee).filter(Boolean).filter(a => a !== 'Unassigned'))].sort())

const hasActiveFilters = computed(() => !!filterType.value || !!filterStatus.value || filterAssignees.value.length > 0)
const activeFilterCount = computed(() => [filterType.value, filterStatus.value].filter(Boolean).length + filterAssignees.value.length)

function normalizeStoredFilter(value: unknown, options: string[]): string | null {
  if (typeof value !== 'string') return null
  return options.includes(value) ? value : null
}

function normalizeStoredFilterList(value: unknown, options: string[]): string[] {
  if (!Array.isArray(value)) {
    return typeof value === 'string' && options.includes(value) ? [value] : []
  }

  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && options.includes(entry)))]
}

function reconcileFiltersWithOptions() {
  if (props.tickets.length === 0) return

  const nextType = normalizeStoredFilter(filterType.value, issueTypes.value)
  const nextStatus = normalizeStoredFilter(filterStatus.value, statuses.value)
  const nextAssignees = normalizeStoredFilterList(filterAssignees.value, assignees.value)

  filterType.value = nextType
  filterStatus.value = nextStatus
  filterAssignees.value = nextAssignees
}

function clearFilters() {
  filterType.value = null
  filterStatus.value = null
  filterAssignees.value = []
}

function setExpandedNodes(nodes: Set<string>) {
  storedExpandedNodeKeys.value = [...nodes]
}

function updateExpandedNodes(mutator: (nodes: Set<string>) => void) {
  const nextNodes = new Set(storedExpandedNodeKeys.value)
  mutator(nextNodes)
  setExpandedNodes(nextNodes)
}

function toggleAssigneeFilter(assignee: string) {
  filterAssignees.value = filterAssignees.value.includes(assignee)
    ? filterAssignees.value.filter(current => current !== assignee)
    : [...filterAssignees.value, assignee]
}

// --- Filtered tickets ---
function ticketPassesFilters(ticket: JiraTicket): boolean {
  if (filterType.value && ticket.issueType !== filterType.value) return false
  if (filterStatus.value && ticket.status !== filterStatus.value) return false
  if (filterAssignees.value.length > 0 && !filterAssignees.value.includes(ticket.assignee)) return false
  return true
}

const filteredTickets = computed(() => {
  const query = searchQuery.value.trim()
  const results: { ticket: JiraTicket; score: number }[] = []

  for (const ticket of props.tickets) {
    if (!ticketPassesFilters(ticket)) continue
    const { match, score } = ticketMatchesSearch(ticket, query)
    if (match) results.push({ ticket, score })
  }

  // Sort by score descending when searching
  if (query) results.sort((a, b) => b.score - a.score)
  return results.map(r => r.ticket)
})

const isSearching = computed(() => searchQuery.value.trim().length > 0)
const matchedTicketKeys = computed(() => new Set(filteredTickets.value.map(ticket => ticket.key)))
const ticketByKey = computed(() => new Map(props.tickets.map<readonly [string, JiraTicket]>(ticket => [ticket.key, ticket])))

const displayedTickets = computed(() => {
  if (!isSearching.value || !showParentContext.value) {
    return filteredTickets.value
  }

  const includedKeys = new Set(matchedTicketKeys.value)

  for (const ticket of filteredTickets.value) {
    let parentKey = ticket.parent?.key
    while (parentKey) {
      includedKeys.add(parentKey)
      parentKey = ticketByKey.value.get(parentKey)?.parent?.key
    }
  }

  return props.tickets.filter(ticket => includedKeys.has(ticket.key))
})

// --- Tree building ---
interface TreeNode {
  ticket: JiraTicket
  children: TreeNode[]
}

interface TicketGroupSection {
  id: string
  label: string
  tickets: JiraTicket[]
}

const statusGroupOrder: Record<string, number> = {
  new: 0,
  indeterminate: 1,
  done: 2,
}

const priorityOrder: Record<string, number> = {
  highest: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
}

const dateGroupFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

type DateFieldOption = Extract<SortOption | GroupOption, 'createdAt' | 'updatedAt' | 'dueDate' | 'completedAt'>

interface GroupDescriptor {
  id: string
  label: string
  sortValue: number
}

function compareText(left: string | undefined, right: string | undefined): number {
  return (left || '').localeCompare(right || '', undefined, { sensitivity: 'base' })
}

function getPriorityRank(priority: string): number {
  const normalized = priority.trim().toLowerCase()
  return normalized in priorityOrder ? priorityOrder[normalized] : Number.MAX_SAFE_INTEGER
}

function isDateOption(option: SortOption | GroupOption): option is DateFieldOption {
  return option === 'createdAt' || option === 'updatedAt' || option === 'dueDate' || option === 'completedAt'
}

function getDateValue(ticket: JiraTicket, option: DateFieldOption): string | undefined {
  switch (option) {
    case 'createdAt':
      return ticket.createdAt
    case 'updatedAt':
      return ticket.updatedAt
    case 'dueDate':
      return ticket.dueDate
    case 'completedAt':
      return ticket.completedAt
  }
}

function getDateTimestamp(value: string | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function compareTicketDates(left: JiraTicket, right: JiraTicket, option: DateFieldOption): number {
  const leftTimestamp = getDateTimestamp(getDateValue(left, option))
  const rightTimestamp = getDateTimestamp(getDateValue(right, option))

  if (leftTimestamp === null && rightTimestamp === null) {
    return compareText(left.key, right.key)
  }

  if (leftTimestamp === null) return 1
  if (rightTimestamp === null) return -1

  const timestampCompare = option === 'dueDate'
    ? leftTimestamp - rightTimestamp
    : rightTimestamp - leftTimestamp

  return timestampCompare || compareText(left.key, right.key)
}

function getGroupDescriptor(ticket: JiraTicket, option: GroupOption): GroupDescriptor {
  if (isDateOption(option)) {
    const rawValue = getDateValue(ticket, option)
    const timestamp = getDateTimestamp(rawValue)

    if (timestamp === null) {
      const label = option === 'dueDate' ? 'No due date' : 'No date'
      return {
        id: `${option}-none`,
        label,
        sortValue: Number.MAX_SAFE_INTEGER,
      }
    }

    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')

    return {
      id: `${option}-${year}-${month}-${day}`,
      label: dateGroupFormatter.format(date),
      sortValue: option === 'dueDate' ? timestamp : -timestamp,
    }
  }

  switch (option) {
    case 'status':
      return { id: ticket.status || 'no-status', label: ticket.status || 'No status', sortValue: 0 }
    case 'priority':
      return { id: ticket.priority || 'no-priority', label: ticket.priority || 'No priority', sortValue: getPriorityRank(ticket.priority || '') }
    case 'assignee':
      return { id: ticket.assignee || 'unassigned', label: ticket.assignee || 'Unassigned', sortValue: ticket.assignee === 'Unassigned' ? 1 : 0 }
    case 'type':
      return { id: ticket.issueType || 'other', label: ticket.issueType || 'Other', sortValue: 0 }
    case 'none':
    case 'hierarchy':
    default:
      return { id: 'all', label: '', sortValue: 0 }
  }
}

function compareTickets(left: JiraTicket, right: JiraTicket): number {
  switch (sortBy.value) {
    case 'summary':
      return compareText(left.summary, right.summary) || compareText(left.key, right.key)
    case 'status': {
      const categoryCompare = statusGroupOrder[getStatusGroup(left.statusCategory)] - statusGroupOrder[getStatusGroup(right.statusCategory)]
      return categoryCompare || compareText(left.status, right.status) || compareText(left.key, right.key)
    }
    case 'priority':
      return getPriorityRank(left.priority) - getPriorityRank(right.priority) || compareText(left.priority, right.priority) || compareText(left.key, right.key)
    case 'assignee': {
      const leftAssignee = left.assignee === 'Unassigned' ? 'zzz-unassigned' : left.assignee
      const rightAssignee = right.assignee === 'Unassigned' ? 'zzz-unassigned' : right.assignee
      return compareText(leftAssignee, rightAssignee) || compareText(left.key, right.key)
    }
    case 'type':
      return compareText(left.issueType, right.issueType) || compareText(left.key, right.key)
    case 'createdAt':
    case 'updatedAt':
    case 'dueDate':
    case 'completedAt':
      return compareTicketDates(left, right, sortBy.value)
    case 'key':
    default:
      return compareText(left.key, right.key)
  }
}

function sortTickets(tickets: JiraTicket[]): JiraTicket[] {
  return [...tickets].sort(compareTickets)
}

function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .map(node => ({
      ticket: node.ticket,
      children: sortTreeNodes(node.children),
    }))
    .sort((left, right) => compareTickets(left.ticket, right.ticket))
}

function compareGroupLabels(left: GroupDescriptor, right: GroupDescriptor, option: GroupOption): number {
  if (isDateOption(option)) {
    return left.sortValue - right.sortValue || compareText(left.label, right.label)
  }

  if (option === 'priority') {
    return left.sortValue - right.sortValue || compareText(left.label, right.label)
  }

  if (option === 'status') {
    const leftTicket = props.tickets.find(ticket => ticket.status === left.label)
    const rightTicket = props.tickets.find(ticket => ticket.status === right.label)
    const leftRank = leftTicket ? statusGroupOrder[getStatusGroup(leftTicket.statusCategory)] : Number.MAX_SAFE_INTEGER
    const rightRank = rightTicket ? statusGroupOrder[getStatusGroup(rightTicket.statusCategory)] : Number.MAX_SAFE_INTEGER
    return leftRank - rightRank || compareText(left.label, right.label)
  }

  if (option === 'assignee') {
    if (left.label === 'Unassigned' && right.label !== 'Unassigned') return 1
    if (right.label === 'Unassigned' && left.label !== 'Unassigned') return -1
  }

  return compareText(left.label, right.label)
}

const tree = computed<TreeNode[]>(() => {
  const tickets = displayedTickets.value
  const ticketKeys = new Set(tickets.map(t => t.key))
  const nodes = new Map<string, TreeNode>()

  for (const ticket of tickets) {
    nodes.set(ticket.key, { ticket, children: [] })
  }

  const roots: TreeNode[] = []
  for (const node of nodes.values()) {
    const parentKey = node.ticket.parent?.key
    if (!parentKey || !ticketKeys.has(parentKey)) {
      roots.push(node)
      continue
    }
    const parentNode = nodes.get(parentKey)
    if (!parentNode) {
      roots.push(node)
      continue
    }
    parentNode.children.push(node)
  }
  return sortTreeNodes(roots)
})

const effectiveGroupBy = computed<GroupOption>(() => {
  if (isSearching.value && showParentContext.value) {
    return 'hierarchy'
  }

  return groupBy.value
})

const sortedFilteredTickets = computed(() => {
  if (isSearching.value) {
    return filteredTickets.value
  }

  return sortTickets(filteredTickets.value)
})

const hierarchySections = computed<TicketGroupSection[]>(() => {
  const epics = tree.value.filter(node => node.ticket.issueType?.toLowerCase().includes('epic'))
  const stories = tree.value.filter(node => node.ticket.issueType?.toLowerCase().includes('story'))
  const others = tree.value.filter(node =>
    !node.ticket.issueType?.toLowerCase().includes('epic') &&
    !node.ticket.issueType?.toLowerCase().includes('story'),
  )

  return [
    { id: 'epics', label: 'Epics', tickets: epics.map(node => node.ticket) },
    { id: 'stories', label: 'Stories', tickets: stories.map(node => node.ticket) },
    { id: 'tasks', label: 'Tasks', tickets: others.map(node => node.ticket) },
  ].filter(section => section.tickets.length > 0)
})

const epicNodes = computed(() => tree.value.filter(node => node.ticket.issueType?.toLowerCase().includes('epic')))
const storyNodes = computed(() => tree.value.filter(node => node.ticket.issueType?.toLowerCase().includes('story')))
const otherNodes = computed(() => tree.value.filter(node =>
  !node.ticket.issueType?.toLowerCase().includes('epic') &&
  !node.ticket.issueType?.toLowerCase().includes('story'),
))

const groupedFlatSections = computed<TicketGroupSection[]>(() => {
  if (effectiveGroupBy.value === 'none' || effectiveGroupBy.value === 'hierarchy') {
    return [{
      id: 'all',
      label: 'All tickets',
      tickets: sortedFilteredTickets.value,
    }]
  }

  const groups = new Map<string, { descriptor: GroupDescriptor; tickets: JiraTicket[] }>()
  for (const ticket of sortedFilteredTickets.value) {
    const descriptor = getGroupDescriptor(ticket, effectiveGroupBy.value)
    const existing = groups.get(descriptor.id)
    if (existing) {
      existing.tickets.push(ticket)
    } else {
      groups.set(descriptor.id, { descriptor, tickets: [ticket] })
    }
  }

  return [...groups.entries()]
    .sort(([, left], [, right]) => compareGroupLabels(left.descriptor, right.descriptor, effectiveGroupBy.value))
    .map(([, group]) => ({
      id: group.descriptor.id,
      label: group.descriptor.label,
      tickets: group.tickets,
    }))
})

const collapsedTickets = computed(() => {
  if (effectiveGroupBy.value === 'hierarchy') {
    return tree.value.map(node => node.ticket)
  }

  return groupedFlatSections.value.flatMap(section => section.tickets)
})

watch([issueTypes, statuses, assignees], reconcileFiltersWithOptions)

// Auto-expand parent of selected ticket
watch(() => props.selectedKey, (key) => {
  if (!key) return
  const ticket = props.tickets.find(t => t.key === key)
  const parentKey = ticket?.parent?.key
  if (parentKey) {
    updateExpandedNodes(nodes => {
      nodes.add(parentKey)
      const parent = props.tickets.find(t => t.key === parentKey)
      if (parent?.parent?.key) {
        nodes.add(parent.parent.key)
      }
    })
  }
}, { immediate: true })

// When searching, auto-expand all nodes to show results; restore on clear
watch(isSearching, (searching) => {
  if (searching) {
    // Snapshot current expanded state before expanding for search
    preSearchExpandedNodes.value = new Set(expandedNodes.value)
    updateExpandedNodes(nodes => {
      for (const ticket of filteredTickets.value) {
        if (ticket.parent?.key) {
          nodes.add(ticket.parent.key)
          const parent = props.tickets.find(t => t.key === ticket.parent?.key)
          if (parent?.parent?.key) nodes.add(parent.parent.key)
        }
      }
    })
  } else {
    // Restore the pre-search expanded state
    if (preSearchExpandedNodes.value !== null) {
      setExpandedNodes(preSearchExpandedNodes.value)
      preSearchExpandedNodes.value = null
    }
  }
})

// Also expand when search query changes
watch(searchQuery, () => {
  if (searchQuery.value.trim()) {
    updateExpandedNodes(nodes => {
      for (const ticket of filteredTickets.value) {
        if (ticket.parent?.key) {
          nodes.add(ticket.parent.key)
          const parent = props.tickets.find(t => t.key === ticket.parent?.key)
          if (parent?.parent?.key) nodes.add(parent.parent.key)
        }
      }
    })
  }
})

function toggleNode(key: string) {
  updateExpandedNodes(nodes => {
    if (nodes.has(key)) {
      nodes.delete(key)
    } else {
      nodes.add(key)
    }
  })
}

function collapseAll() {
  setExpandedNodes(new Set())
}

function expandAll() {
  const keys = new Set<string>()
  function collect(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.children.length > 0) {
        keys.add(node.ticket.key)
        collect(node.children)
      }
    }
  }
  collect(tree.value)
  setExpandedNodes(keys)
}

function getAccentDot(issueType: string): string {
  const type = issueType?.toLowerCase() || ''
  if (type.includes('epic')) return 'bg-amber-400'
  if (type.includes('story')) return 'bg-indigo-400'
  if (type.includes('bug')) return 'bg-rose-400'
  if (type.includes('sub')) return 'bg-sky-400'
  return 'bg-emerald-400'
}

function getFilterChipClass(issueType: string): string {
  const type = issueType?.toLowerCase() || ''
  if (type.includes('epic')) return 'border-amber-500/20 text-amber-300 bg-amber-500/[0.06]'
  if (type.includes('story')) return 'border-indigo-500/20 text-indigo-300 bg-indigo-500/[0.06]'
  if (type.includes('bug')) return 'border-rose-500/20 text-rose-300 bg-rose-500/[0.06]'
  if (type.includes('sub')) return 'border-sky-500/20 text-sky-300 bg-sky-500/[0.06]'
  return 'border-emerald-500/20 text-emerald-300 bg-emerald-500/[0.06]'
}

function isDirectMatch(key: string): boolean {
  return matchedTicketKeys.value.has(key)
}
</script>

<template>
  <aside
    class="relative h-screen w-full overflow-hidden border-r border-white/[0.06] bg-surface-1/80 backdrop-blur-lg transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col"
  >
    <!-- Sidebar header -->
    <div class="flex items-center justify-between px-4 py-4 border-b border-white/[0.04]" :class="collapsed ? 'px-3' : 'px-4'">
      <button v-if="!collapsed" class="flex items-center min-w-0 hover:opacity-80 transition-opacity" @click="emit('home')">
        <span class="font-display text-base text-white truncate">BetterJira</span>
      </button>
      <button
        class="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all"
        @click="$emit('toggle-collapse')"
      >
        <svg class="h-4 w-4 transition-transform duration-300" :class="collapsed ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
    </div>

    <!-- Search & Filters (expanded only) -->
    <div v-if="!collapsed" class="px-3 pt-3 pb-1 space-y-2 border-b border-white/[0.04]">
      <!-- Search input -->
      <div class="relative">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search tickets..."
          class="w-full rounded-lg bg-white/[0.04] border border-white/[0.06] pl-8 pr-3 py-1.5 text-[11px] text-slate-300 placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20 font-body"
        />
        <button
          v-if="searchQuery"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
          @click="searchQuery = ''"
        >
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Filter toggle row -->
      <div class="flex items-center gap-1.5">
        <button
          class="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all"
          :class="showFilters
            ? 'bg-indigo-500/[0.1] text-indigo-300 border border-indigo-500/20'
            : 'text-slate-500 hover:text-slate-400 hover:bg-white/[0.03] border border-transparent'"
          @click="showFilters = !showFilters"
        >
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          <span
            v-if="activeFilterCount > 0"
            class="ml-0.5 min-w-[14px] h-[14px] rounded-full bg-indigo-500/30 text-indigo-300 text-[9px] font-bold flex items-center justify-center"
          >
            {{ activeFilterCount }}
          </span>
        </button>

        <button
          v-if="hasActiveFilters"
          class="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
          @click="clearFilters"
        >
          Clear
        </button>

        <button
          v-if="searchQuery.trim()"
          class="rounded-md border px-2 py-1 text-[10px] font-medium transition-all"
          :class="showParentContext
            ? 'border-indigo-500/20 bg-indigo-500/[0.1] text-indigo-300'
            : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.1]'"
          @click="showParentContext = !showParentContext"
        >
          Parents
        </button>

        <!-- Active filter pills (compact) -->
        <div class="flex-1 flex items-center gap-1 overflow-hidden min-w-0">
          <span
            v-if="filterType && !showFilters"
            class="truncate rounded-full border px-1.5 py-0.5 text-[9px] font-medium max-w-[80px]"
            :class="getFilterChipClass(filterType)"
          >
            {{ filterType }}
          </span>
          <span
            v-if="filterStatus && !showFilters"
            class="truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400 max-w-[80px]"
          >
            {{ filterStatus }}
          </span>
          <span
            v-if="filterAssignees.length > 0 && !showFilters"
            class="truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400 max-w-[110px]"
          >
            {{ filterAssignees[0] }}<template v-if="filterAssignees.length > 1"> +{{ filterAssignees.length - 1 }}</template>
          </span>
        </div>

        <!-- Collapse / Expand all tree nodes -->
        <button
          v-if="effectiveGroupBy === 'hierarchy'"
          class="p-1 rounded text-slate-600 hover:text-slate-400 hover:bg-white/[0.04] transition-all"
          title="Collapse all"
          @click="collapseAll"
        >
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          v-if="effectiveGroupBy === 'hierarchy'"
          class="p-1 rounded text-slate-600 hover:text-slate-400 hover:bg-white/[0.04] transition-all"
          title="Expand all"
          @click="expandAll"
        >
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="space-y-1">
          <span class="px-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-600 font-medium">Sort</span>
          <select
            v-model="sortBy"
            class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-[10px] text-slate-300 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
          >
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="space-y-1">
          <span class="px-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-600 font-medium">Group by</span>
          <select
            v-model="groupBy"
            class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-[10px] text-slate-300 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
          >
            <option v-for="option in groupOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <!-- Expanded filter dropdowns -->
      <Transition name="expand">
        <div v-if="showFilters" class="space-y-1.5 pb-1">
          <!-- Type filter -->
          <div>
            <div class="text-[9px] uppercase tracking-[0.12em] text-slate-600 font-medium mb-1 px-0.5">Type</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="type in issueTypes"
                :key="type"
                class="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all"
                :class="filterType === type
                  ? getFilterChipClass(type) + ' ring-1 ring-white/10'
                  : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.1] bg-transparent'"
                @click="filterType = filterType === type ? null : type"
              >
                {{ type }}
              </button>
            </div>
          </div>

          <!-- Status filter -->
          <div>
            <div class="text-[9px] uppercase tracking-[0.12em] text-slate-600 font-medium mb-1 px-0.5">Status</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="status in statuses"
                :key="status"
                class="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all"
                :class="filterStatus === status
                  ? 'border-white/[0.15] bg-white/[0.06] text-slate-200 ring-1 ring-white/10'
                  : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.1] bg-transparent'"
                @click="filterStatus = filterStatus === status ? null : status"
              >
                {{ status }}
              </button>
            </div>
          </div>

          <!-- Assignee filter -->
          <div>
            <div class="text-[9px] uppercase tracking-[0.12em] text-slate-600 font-medium mb-1 px-0.5">Assignee</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="assignee in assignees"
                :key="assignee"
                class="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all truncate max-w-[120px]"
                :class="filterAssignees.includes(assignee)
                  ? 'border-white/[0.15] bg-white/[0.06] text-slate-200 ring-1 ring-white/10'
                  : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.1] bg-transparent'"
                @click="toggleAssigneeFilter(assignee)"
              >
                {{ assignee }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Result count when filtering -->
      <div v-if="isSearching || hasActiveFilters" class="px-0.5 pb-1 text-[10px] text-slate-600">
        {{ filteredTickets.length }} of {{ tickets.length }} tickets
      </div>
    </div>

    <!-- Collapsed state: just dots -->
    <div v-if="collapsed" class="sidebar-scrollbar scrollbar-gutter-stable flex-1 overflow-y-auto py-3 px-2 space-y-1.5">
      <button
        v-for="ticket in collapsedTickets"
        :key="ticket.key"
        class="w-full flex items-center justify-center p-1.5 rounded-lg transition-all"
        :class="selectedKey === ticket.key ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'"
        :title="ticket.key + ': ' + ticket.summary"
        @click="emit('select', ticket.key)"
        @mouseenter="emit('prefetch', ticket.key)"
      >
        <span class="w-2 h-2 rounded-full" :class="getAccentDot(ticket.issueType)"></span>
      </button>
    </div>

    <!-- Expanded state: full tree (or flat results when searching) -->
    <div v-else class="sidebar-scrollbar scrollbar-gutter-stable flex-1 overflow-y-auto py-2 scroll-smooth">
      <template v-if="effectiveGroupBy !== 'hierarchy'">
        <div
          v-for="section in groupedFlatSections"
          :key="section.id"
          class="mb-2"
        >
          <div
            v-if="effectiveGroupBy !== 'none'"
            class="px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] text-slate-600 font-medium"
          >
            {{ section.label }}
          </div>

          <button
            v-for="ticket in section.tickets"
            :key="ticket.key"
            class="w-full flex items-center gap-2 px-4 py-2 text-left transition-all group"
            :class="selectedKey === ticket.key
              ? 'bg-indigo-500/[0.08] text-indigo-200'
              : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'"
            @click="emit('select', ticket.key)"
            @mouseenter="emit('prefetch', ticket.key)"
          >
            <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="getAccentDot(ticket.issueType)"></span>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium truncate">{{ ticket.summary }}</div>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="text-[9px] text-slate-600">{{ ticket.key }}</span>
                <span class="text-[9px] text-slate-700">&middot;</span>
                <span class="text-[9px] text-slate-600">{{ ticket.issueType }}</span>
                <span v-if="ticket.assignee && ticket.assignee !== 'Unassigned'" class="text-[9px] text-slate-700">&middot;</span>
                <span v-if="ticket.assignee && ticket.assignee !== 'Unassigned'" class="text-[9px] text-slate-600 truncate">{{ ticket.assignee }}</span>
              </div>
            </div>
          </button>
        </div>

        <div v-if="filteredTickets.length === 0" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">No tickets match</p>
          <button
            class="mt-1 text-[10px] text-indigo-400/60 hover:text-indigo-400 transition-colors"
            @click="searchQuery = ''; clearFilters()"
          >
            Clear search
          </button>
        </div>
      </template>

      <template v-else-if="isSearching && !showParentContext">
        <button
          v-for="ticket in filteredTickets"
          :key="ticket.key"
          class="w-full flex items-center gap-2 px-4 py-2 text-left transition-all group"
          :class="selectedKey === ticket.key
            ? 'bg-indigo-500/[0.08] text-indigo-200'
            : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'"
          @click="emit('select', ticket.key)"
          @mouseenter="emit('prefetch', ticket.key)"
        >
          <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="getAccentDot(ticket.issueType)"></span>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium truncate">{{ ticket.summary }}</div>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="text-[9px] text-slate-600">{{ ticket.key }}</span>
              <span class="text-[9px] text-slate-700">&middot;</span>
              <span class="text-[9px] text-slate-600">{{ ticket.issueType }}</span>
              <span v-if="ticket.assignee && ticket.assignee !== 'Unassigned'" class="text-[9px] text-slate-700">&middot;</span>
              <span v-if="ticket.assignee && ticket.assignee !== 'Unassigned'" class="text-[9px] text-slate-600 truncate">{{ ticket.assignee }}</span>
            </div>
          </div>
        </button>
        <div v-if="filteredTickets.length === 0" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">No tickets match</p>
          <button
            class="mt-1 text-[10px] text-indigo-400/60 hover:text-indigo-400 transition-colors"
            @click="searchQuery = ''; clearFilters()"
          >
            Clear search
          </button>
        </div>
      </template>

      <template v-else>
        <!-- Epics -->
        <div v-if="hierarchySections.some(section => section.id === 'epics')" class="mb-2">
          <div class="px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] text-slate-600 font-medium">Epics</div>
          <div v-for="node in epicNodes" :key="node.ticket.key">
            <button
              class="w-full flex items-center gap-2 px-4 py-2 text-left transition-all group"
              :class="selectedKey === node.ticket.key
                ? 'bg-amber-500/[0.08] text-amber-200'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'"
              @click="emit('select', node.ticket.key)"
              @mouseenter="emit('prefetch', node.ticket.key)"
            >
              <button
                v-if="node.children.length > 0"
                class="flex-shrink-0 p-0.5 rounded transition-all text-slate-600 hover:text-slate-400"
                @click.stop="toggleNode(node.ticket.key)"
              >
                <svg class="h-3 w-3 transition-transform duration-200" :class="expandedNodes.has(node.ticket.key) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span v-else class="w-4 flex-shrink-0"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"></span>
              <span class="text-xs font-medium truncate flex-1">{{ node.ticket.summary }}</span>
              <span
                v-if="isSearching && !isDirectMatch(node.ticket.key)"
                class="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-500"
              >
                Parent
              </span>
              <span class="text-[10px] text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{{ node.ticket.key }}</span>
            </button>

            <Transition name="expand">
              <div v-if="expandedNodes.has(node.ticket.key) && node.children.length > 0" class="ml-6 border-l border-white/[0.04]">
                <div v-for="child in node.children" :key="child.ticket.key">
                  <button
                    class="w-full flex items-center gap-2 pl-4 pr-4 py-1.5 text-left transition-all group"
                    :class="selectedKey === child.ticket.key
                      ? 'bg-indigo-500/[0.08] text-indigo-200'
                      : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300'"
                    @click="emit('select', child.ticket.key)"
                    @mouseenter="emit('prefetch', child.ticket.key)"
                  >
                    <button
                      v-if="child.children.length > 0"
                      class="flex-shrink-0 p-0.5 rounded transition-all text-slate-600 hover:text-slate-400"
                      @click.stop="toggleNode(child.ticket.key)"
                    >
                      <svg class="h-2.5 w-2.5 transition-transform duration-200" :class="expandedNodes.has(child.ticket.key) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <span v-else class="w-3 flex-shrink-0"></span>
                    <span class="w-1 h-1 rounded-full flex-shrink-0" :class="getAccentDot(child.ticket.issueType)"></span>
                    <span class="text-[11px] truncate flex-1">{{ child.ticket.summary }}</span>
                    <span
                      v-if="isSearching && !isDirectMatch(child.ticket.key)"
                      class="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-500"
                    >
                      Parent
                    </span>
                  </button>

                  <Transition name="expand">
                    <div v-if="expandedNodes.has(child.ticket.key) && child.children.length > 0" class="ml-5 border-l border-white/[0.03]">
                      <button
                        v-for="grandchild in child.children"
                        :key="grandchild.ticket.key"
                        class="w-full flex items-center gap-2 pl-4 pr-4 py-1 text-left transition-all"
                        :class="selectedKey === grandchild.ticket.key
                          ? 'bg-emerald-500/[0.06] text-emerald-300'
                          : 'text-slate-600 hover:bg-white/[0.02] hover:text-slate-400'"
                        @click="emit('select', grandchild.ticket.key)"
                        @mouseenter="emit('prefetch', grandchild.ticket.key)"
                      >
                        <span class="w-3 flex-shrink-0"></span>
                        <span class="w-1 h-1 rounded-full flex-shrink-0" :class="getAccentDot(grandchild.ticket.issueType)"></span>
                        <span class="text-[10px] truncate flex-1">{{ grandchild.ticket.summary }}</span>
                        <span
                          v-if="isSearching && !isDirectMatch(grandchild.ticket.key)"
                          class="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-500"
                        >
                          Parent
                        </span>
                      </button>
                    </div>
                  </Transition>
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <!-- Standalone Stories -->
        <div v-if="hierarchySections.some(section => section.id === 'stories')" class="mb-2">
          <div class="px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] text-slate-600 font-medium">Stories</div>
          <div v-for="node in storyNodes" :key="node.ticket.key">
            <button
              class="w-full flex items-center gap-2 px-4 py-2 text-left transition-all group"
              :class="selectedKey === node.ticket.key
                ? 'bg-indigo-500/[0.08] text-indigo-200'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'"
              @click="emit('select', node.ticket.key)"
              @mouseenter="emit('prefetch', node.ticket.key)"
            >
              <button
                v-if="node.children.length > 0"
                class="flex-shrink-0 p-0.5 rounded transition-all text-slate-600 hover:text-slate-400"
                @click.stop="toggleNode(node.ticket.key)"
              >
                <svg class="h-3 w-3 transition-transform duration-200" :class="expandedNodes.has(node.ticket.key) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span v-else class="w-4 flex-shrink-0"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0"></span>
              <span class="text-xs font-medium truncate flex-1">{{ node.ticket.summary }}</span>
              <span
                v-if="isSearching && !isDirectMatch(node.ticket.key)"
                class="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-500"
              >
                Parent
              </span>
              <span class="text-[10px] text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{{ node.ticket.key }}</span>
            </button>

            <Transition name="expand">
              <div v-if="expandedNodes.has(node.ticket.key) && node.children.length > 0" class="ml-6 border-l border-white/[0.04]">
                <button
                  v-for="child in node.children"
                  :key="child.ticket.key"
                  class="w-full flex items-center gap-2 pl-4 pr-4 py-1.5 text-left transition-all"
                  :class="selectedKey === child.ticket.key
                    ? 'bg-emerald-500/[0.06] text-emerald-300'
                    : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300'"
                  @click="emit('select', child.ticket.key)"
                  @mouseenter="emit('prefetch', child.ticket.key)"
                >
                  <span class="w-3 flex-shrink-0"></span>
                  <span class="w-1 h-1 rounded-full flex-shrink-0" :class="getAccentDot(child.ticket.issueType)"></span>
                  <span class="text-[11px] truncate flex-1">{{ child.ticket.summary }}</span>
                  <span
                    v-if="isSearching && !isDirectMatch(child.ticket.key)"
                    class="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-500"
                  >
                    Parent
                  </span>
                </button>
              </div>
            </Transition>
          </div>
        </div>

        <!-- Other (tasks, bugs, etc.) -->
        <div v-if="hierarchySections.some(section => section.id === 'tasks')">
          <div class="px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] text-slate-600 font-medium">Tasks</div>
          <button
            v-for="node in otherNodes"
            :key="node.ticket.key"
            class="w-full flex items-center gap-2 px-4 py-1.5 text-left transition-all group"
            :class="selectedKey === node.ticket.key
              ? 'bg-emerald-500/[0.06] text-emerald-300'
              : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'"
            @click="emit('select', node.ticket.key)"
            @mouseenter="emit('prefetch', node.ticket.key)"
          >
            <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="getAccentDot(node.ticket.issueType)"></span>
            <span class="text-xs truncate flex-1">{{ node.ticket.summary }}</span>
            <span
              v-if="isSearching && !isDirectMatch(node.ticket.key)"
              class="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-500"
            >
              Parent
            </span>
            <span class="text-[10px] text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{{ node.ticket.key }}</span>
          </button>
        </div>

        <div v-if="filteredTickets.length === 0 && isSearching" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">No tickets match</p>
          <button
            class="mt-1 text-[10px] text-indigo-400/60 hover:text-indigo-400 transition-colors"
            @click="searchQuery = ''; clearFilters()"
          >
            Clear search
          </button>
        </div>

        <!-- Empty state for filters (no search) -->
        <div v-if="filteredTickets.length === 0 && hasActiveFilters && !isSearching" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">No tickets match filters</p>
          <button
            class="mt-1 text-[10px] text-indigo-400/60 hover:text-indigo-400 transition-colors"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </template>
    </div>

    <!-- Bottom: ticket count + refresh -->
    <div v-if="!collapsed" class="px-3 py-2.5 border-t border-white/[0.04] flex items-center justify-between">
      <span class="text-[10px] text-slate-600">
        {{ filteredTickets.length }}<span v-if="filteredTickets.length !== tickets.length"> of {{ tickets.length }}</span> tickets
      </span>
      <button
        class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all disabled:opacity-40"
        :disabled="refreshing"
        @click="emit('refresh')"
      >
        <svg
          class="h-3 w-3"
          :class="{ 'animate-spin': refreshing }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {{ refreshing ? 'Syncing' : 'Refresh' }}
      </button>
    </div>
    <!-- Collapsed: just refresh icon -->
    <div v-else class="px-2 py-2.5 border-t border-white/[0.04] flex justify-center">
      <button
        class="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all disabled:opacity-40"
        :disabled="refreshing"
        :title="refreshing ? 'Syncing...' : 'Refresh'"
        @click="emit('refresh')"
      >
        <svg
          class="h-3.5 w-3.5"
          :class="{ 'animate-spin': refreshing }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.24) transparent;
}

.sidebar-scrollbar::-webkit-scrollbar {
  width: 2px;
}

.sidebar-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-scrollbar::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.24);
}

.sidebar-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.34);
}
</style>

<style scoped>
.expand-enter-active {
  animation: expandDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.expand-leave-active {
  animation: expandDown 0.15s cubic-bezier(0.4, 0, 1, 1) reverse both;
}

@keyframes expandDown {
  from {
    opacity: 0;
    max-height: 0;
    overflow: hidden;
  }
  to {
    opacity: 1;
    max-height: 500px;
    overflow: hidden;
  }
}
</style>
