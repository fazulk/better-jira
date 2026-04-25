<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { getStatusGroup, type JiraTicket } from '@/types/jira'
import { normalizeStoredStringList } from '@/composables/useSpaces'
import { usePinnedTickets } from '@/composables/usePinnedTickets'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { LOCAL_SPACE_KEY } from '~/shared/localTickets'

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
  settings: []
}>()

// --- State ---
const storedExpandedNodeKeys = useLocalStorage<string[]>('jira2.sidebar.expandedNodes', [])
const expandedNodes = computed(() => new Set(storedExpandedNodeKeys.value))
const preSearchExpandedNodes = ref<Set<string> | null>(null)
const searchQuery = ref('')
const showFilters = ref(false)
const showParentContext = useLocalStorage('jira2.sidebar.showParentContext', true)
const { pinnedKeys, pinnedKeySet, togglePinnedTicket } = usePinnedTickets()
const {
  settings: appSettings,
  enabledSpaces,
  setFilterSpaceKeys,
  setSidebarSettings,
} = useSpaceSettings()

const sortOptions = [
  { value: 'key', label: 'Key' },
  { value: 'summary', label: 'Summary' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'type', label: 'Type' },
  { value: 'createdAt', label: 'Created date' },
  { value: 'updatedAt', label: 'Modified date' },
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
  { value: 'updatedAt', label: 'Modified date' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'completedAt', label: 'Completed date' },
  { value: 'none', label: 'None' },
] as const

type SortOption = (typeof sortOptions)[number]['value']
type GroupOption = (typeof groupOptions)[number]['value']
type TicketScope = 'currentSprint' | 'all'

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
    ticket.spaceName,
    ticket.spaceKey,
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
const ticketByGlobalKey = computed(() => new Map(props.tickets.map<readonly [string, JiraTicket]>(ticket => [ticket.key, ticket])))
const pinnedKeyOrder = computed(() => new Map(pinnedKeys.value.map((key, index) => [key, index] as const)))
const pinnedTickets = computed(() => pinnedKeys.value
  .map(key => ticketByGlobalKey.value.get(key))
  .filter((ticket): ticket is JiraTicket => Boolean(ticket))
  .filter(ticket => enabledSpaceKeys.value.includes(ticket.spaceKey))
  .filter(ticket => showCompletedTickets.value || getStatusGroup(ticket.statusCategory) !== 'done')
  .sort((left, right) => {
    const priorityCompare = getPriorityRank(left.priority) - getPriorityRank(right.priority)
    if (priorityCompare !== 0) {
      return priorityCompare
    }

    return (pinnedKeyOrder.value.get(left.key) ?? Number.MAX_SAFE_INTEGER)
      - (pinnedKeyOrder.value.get(right.key) ?? Number.MAX_SAFE_INTEGER)
  }))

function isVisibleInCurrentSprintScope(ticket: JiraTicket): boolean {
  return ticket.spaceKey === LOCAL_SPACE_KEY || ticket.inCurrentSprint
}

const scopedTickets = computed(() => (
  ticketScope.value === 'currentSprint'
    ? props.tickets.filter(isVisibleInCurrentSprintScope)
    : props.tickets
))
const enabledSpaceKeys = computed(() => enabledSpaces.value.map(space => space.key))
const spaceScopedTickets = computed(() => (
  scopedTickets.value.filter(ticket => enabledSpaceKeys.value.includes(ticket.spaceKey))
))
const sidebarScopedTickets = computed(() => (
  spaceScopedTickets.value.filter(ticket => showCompletedTickets.value || getStatusGroup(ticket.statusCategory) !== 'done')
))
const currentSprintSidebarTicketCount = computed(() => sidebarScopedTickets.value.filter(isVisibleInCurrentSprintScope).length)
const filterableScopedTickets = computed(() => (
  sidebarScopedTickets.value.filter(ticket => !pinnedKeySet.value.has(ticket.key))
))
const spaces = computed(() => enabledSpaces.value.map(space => ({
  key: space.key,
  name: space.name || space.key,
})))
const issueTypes = computed(() => [...new Set(filterableScopedTickets.value.map(t => t.issueType).filter(Boolean))].sort())
const statuses = computed(() => [...new Set(filterableScopedTickets.value.map(t => t.status).filter(Boolean))].sort())
const assignees = computed(() => [...new Set(filterableScopedTickets.value.map(t => t.assignee).filter(Boolean).filter(a => a !== 'Unassigned'))].sort())
const filterSpaces = computed<string[]>({
  get: () => normalizeStoredStringList(appSettings.value.filterSpaceKeys, spaces.value.map(space => space.key)),
  set: (value) => {
    void setFilterSpaceKeys(value)
  },
})
const filterTypes = computed<string[]>({
  get: () => normalizeStoredStringList(appSettings.value.sidebar.filterTypeKeys, issueTypes.value),
  set: (value) => {
    void setSidebarSettings({
      filterTypeKeys: value,
    })
  },
})
const filterStatuses = computed<string[]>({
  get: () => normalizeStoredStringList(appSettings.value.sidebar.filterStatuses, statuses.value),
  set: (value) => {
    void setSidebarSettings({
      filterStatuses: value,
    })
  },
})
const filterAssignees = computed<string[]>({
  get: () => normalizeStoredStringList(appSettings.value.sidebar.filterAssignees, assignees.value),
  set: (value) => {
    void setSidebarSettings({
      filterAssignees: value,
    })
  },
})
const showCompletedTickets = computed<boolean>({
  get: () => appSettings.value.sidebar.showCompletedTickets,
  set: (value) => {
    void setSidebarSettings({
      showCompletedTickets: value,
    })
  },
})
const sortBy = computed<SortOption>({
  get: () => appSettings.value.sidebar.sortBy,
  set: (value) => {
    void setSidebarSettings({
      sortBy: value,
    })
  },
})
const groupBy = computed<GroupOption>({
  get: () => appSettings.value.sidebar.groupBy,
  set: (value) => {
    void setSidebarSettings({
      groupBy: value,
    })
  },
})
const sortReversed = computed<boolean>({
  get: () => appSettings.value.sidebar.sortReversed,
  set: (value) => {
    void setSidebarSettings({
      sortReversed: value,
    })
  },
})
const ticketScope = computed<TicketScope>({
  get: () => appSettings.value.sidebar.ticketScope,
  set: (value) => {
    void setSidebarSettings({
      ticketScope: value,
    })
  },
})

const hasActiveFilters = computed(() => (
  filterSpaces.value.length > 0
  || filterTypes.value.length > 0
  || filterStatuses.value.length > 0
  || filterAssignees.value.length > 0
  || showCompletedTickets.value
))
const activeFilterCount = computed(() => (
  filterSpaces.value.length
  + filterTypes.value.length
  + filterStatuses.value.length
  + filterAssignees.value.length
  + (showCompletedTickets.value ? 1 : 0)
))
const scopeResultLabel = computed(() => (
  ticketScope.value === 'currentSprint' ? 'current sprint items' : 'items'
))
const emptyStateMessage = computed(() => {
  if (isSearching.value) {
    return 'No items match'
  }

  if (hasActiveFilters.value) {
    return 'No items match filters'
  }

  if (enabledSpaceKeys.value.length === 0) {
    return 'No spaces configured'
  }

  return ticketScope.value === 'currentSprint'
    ? 'No items in current sprint'
    : 'No items to show'
})

function reconcileFiltersWithOptions() {
  if (props.tickets.length === 0) return

  const nextSpaces = normalizeStoredStringList(filterSpaces.value, spaces.value.map(space => space.key))
  const nextTypes = normalizeStoredStringList(filterTypes.value, issueTypes.value)
  const nextStatuses = normalizeStoredStringList(filterStatuses.value, statuses.value)
  const nextAssignees = normalizeStoredStringList(filterAssignees.value, assignees.value)

  if (!areStringListsEqual(filterSpaces.value, nextSpaces)) {
    filterSpaces.value = nextSpaces
  }

  if (!areStringListsEqual(filterTypes.value, nextTypes)) {
    filterTypes.value = nextTypes
  }

  if (!areStringListsEqual(filterStatuses.value, nextStatuses)) {
    filterStatuses.value = nextStatuses
  }

  if (!areStringListsEqual(filterAssignees.value, nextAssignees)) {
    filterAssignees.value = nextAssignees
  }
}

function reconcilePinnedKeysWithTickets() {
  if (props.tickets.length === 0) return

  const availableKeys = new Set(props.tickets.map(ticket => ticket.key))
  const nextPinnedKeys = pinnedKeys.value.filter(key => availableKeys.has(key))

  if (nextPinnedKeys.length !== pinnedKeys.value.length) {
    pinnedKeys.value = nextPinnedKeys
  }
}

function clearFilters() {
  filterSpaces.value = []
  filterTypes.value = []
  filterStatuses.value = []
  filterAssignees.value = []
  showCompletedTickets.value = false
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

function toggleFilterValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter(current => current !== value)
    : [...values, value]
}

function areStringListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function toggleTypeFilter(type: string) {
  filterTypes.value = toggleFilterValue(filterTypes.value, type)
}

function toggleStatusFilter(status: string) {
  filterStatuses.value = toggleFilterValue(filterStatuses.value, status)
}

function toggleSpaceFilter(spaceKey: string) {
  filterSpaces.value = toggleFilterValue(filterSpaces.value, spaceKey)
}

// --- Filtered tickets ---
function ticketPassesFilters(ticket: JiraTicket): boolean {
  if (filterSpaces.value.length > 0 && !filterSpaces.value.includes(ticket.spaceKey)) {
    return false
  }
  if (filterTypes.value.length > 0 && !filterTypes.value.includes(ticket.issueType)) return false
  if (filterStatuses.value.length > 0 && !filterStatuses.value.includes(ticket.status)) return false
  if (filterAssignees.value.length > 0 && !filterAssignees.value.includes(ticket.assignee)) return false
  return true
}

const filteredTickets = computed(() => {
  const query = searchQuery.value.trim()
  const results: { ticket: JiraTicket; score: number }[] = []

  for (const ticket of filterableScopedTickets.value) {
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
const ticketByKey = computed(() => new Map(sidebarScopedTickets.value.map<readonly [string, JiraTicket]>(ticket => [ticket.key, ticket])))
const hasPinnedTickets = computed(() => pinnedTickets.value.length > 0)
const hasVisibleTickets = computed(() => filteredTickets.value.length > 0 || hasPinnedTickets.value)
const visibleSummary = computed(() => {
  const segments = [`${filteredTickets.value.length} of ${filterableScopedTickets.value.length} ${scopeResultLabel.value}`]
  if (hasPinnedTickets.value) {
    segments.push(`${pinnedTickets.value.length} pinned`)
  }
  return segments.join(' · ')
})

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

  return filterableScopedTickets.value.filter(ticket => includedKeys.has(ticket.key))
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

const priorityIndicatorClasses: Record<string, string> = {
  highest: 'bg-red-400 border-red-300/30',
  high: 'bg-orange-400 border-orange-300/30',
  medium: 'bg-yellow-300 border-yellow-200/30',
  low: 'bg-sky-400 border-sky-300/30',
  lowest: 'bg-slate-400 border-slate-300/20',
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

function applySortDirection(value: number): number {
  return sortReversed.value ? -value : value
}

function getPriorityRank(priority: string): number {
  const normalized = priority.trim().toLowerCase()
  return normalized in priorityOrder ? priorityOrder[normalized] : Number.MAX_SAFE_INTEGER
}

function getPriorityIndicatorClass(priority: string): string {
  const normalized = priority.trim().toLowerCase()
  if (!normalized) {
    return 'bg-transparent border-white/[0.08]'
  }

  return priorityIndicatorClasses[normalized] ?? 'bg-white/[0.14] border-white/[0.08]'
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

  const compare = timestampCompare || compareText(left.key, right.key)
  return sortReversed.value ? -compare : compare
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
      return applySortDirection(compareText(left.summary, right.summary) || compareText(left.key, right.key))
    case 'status': {
      const categoryCompare = statusGroupOrder[getStatusGroup(left.statusCategory)] - statusGroupOrder[getStatusGroup(right.statusCategory)]
      return applySortDirection(categoryCompare || compareText(left.status, right.status) || compareText(left.key, right.key))
    }
    case 'priority':
      return applySortDirection(getPriorityRank(left.priority) - getPriorityRank(right.priority) || compareText(left.priority, right.priority) || compareText(left.key, right.key))
    case 'assignee': {
      const leftAssignee = left.assignee === 'Unassigned' ? 'zzz-unassigned' : left.assignee
      const rightAssignee = right.assignee === 'Unassigned' ? 'zzz-unassigned' : right.assignee
      return applySortDirection(compareText(leftAssignee, rightAssignee) || compareText(left.key, right.key))
    }
    case 'type':
      return applySortDirection(compareText(left.issueType, right.issueType) || compareText(left.key, right.key))
    case 'createdAt':
    case 'updatedAt':
    case 'dueDate':
    case 'completedAt':
      return compareTicketDates(left, right, sortBy.value)
    case 'key':
    default:
      return applySortDirection(compareText(left.key, right.key))
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
    if (left.id.endsWith('-none')) return 1
    if (right.id.endsWith('-none')) return -1
    return applySortDirection(left.sortValue - right.sortValue || compareText(left.label, right.label))
  }

  if (option === 'priority') {
    return applySortDirection(left.sortValue - right.sortValue || compareText(left.label, right.label))
  }

  if (option === 'status') {
    const leftTicket = props.tickets.find(ticket => ticket.status === left.label)
    const rightTicket = props.tickets.find(ticket => ticket.status === right.label)
    const leftRank = leftTicket ? statusGroupOrder[getStatusGroup(leftTicket.statusCategory)] : Number.MAX_SAFE_INTEGER
    const rightRank = rightTicket ? statusGroupOrder[getStatusGroup(rightTicket.statusCategory)] : Number.MAX_SAFE_INTEGER
    return applySortDirection(leftRank - rightRank || compareText(left.label, right.label))
  }

  if (option === 'assignee') {
    if (left.label === 'Unassigned' && right.label !== 'Unassigned') return applySortDirection(1)
    if (right.label === 'Unassigned' && left.label !== 'Unassigned') return applySortDirection(-1)
  }

  return applySortDirection(compareText(left.label, right.label))
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

watch([spaces, issueTypes, statuses, assignees], reconcileFiltersWithOptions, { immediate: true })
watch(() => props.tickets, reconcilePinnedKeysWithTickets, { immediate: true })

// Auto-expand parent of selected ticket
watch(() => props.selectedKey, (key) => {
  if (!key) return
  const ticket = sidebarScopedTickets.value.find(t => t.key === key)
  const parentKey = ticket?.parent?.key
  if (parentKey) {
    updateExpandedNodes(nodes => {
      nodes.add(parentKey)
      const parent = sidebarScopedTickets.value.find(t => t.key === parentKey)
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
          const parent = sidebarScopedTickets.value.find(t => t.key === ticket.parent?.key)
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
          const parent = sidebarScopedTickets.value.find(t => t.key === ticket.parent?.key)
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

function getSpaceName(spaceKey: string): string {
  return spaces.value.find(space => space.key === spaceKey)?.name
    ?? spaceKey
}

function isDirectMatch(key: string): boolean {
  return matchedTicketKeys.value.has(key)
}

// --- Tooltip ---
const tooltipTicket = ref<JiraTicket | null>(null)
const tooltipVisible = ref(false)
const tooltipPosition = ref({ top: 0, left: 0 })
let tooltipTimer: ReturnType<typeof setTimeout> | null = null

function getStatusBadgeClass(statusCategory: string): string {
  const group = getStatusGroup(statusCategory)
  if (group === 'done') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (group === 'new') return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
}

function showTicketTooltip(ticket: JiraTicket, event: MouseEvent, delay: number = 0) {
  if (tooltipTimer) clearTimeout(tooltipTimer)

  const show = () => {
    tooltipTicket.value = ticket
    const target = (event.currentTarget || event.target) as HTMLElement
    const rect = target.getBoundingClientRect()

    let top = rect.top + rect.height / 2
    let left = rect.right + 10

    // If tooltip would overflow right edge, show to the left
    if (left + 280 > window.innerWidth) {
      left = rect.left - 280 - 10
    }

    // Clamp vertical so it stays on screen
    const tooltipApproxHeight = 170
    if (top - tooltipApproxHeight / 2 < 12) {
      top = tooltipApproxHeight / 2 + 12
    } else if (top + tooltipApproxHeight / 2 > window.innerHeight - 12) {
      top = window.innerHeight - tooltipApproxHeight / 2 - 12
    }

    tooltipPosition.value = { top, left }
    tooltipVisible.value = true
  }

  if (delay > 0) {
    tooltipTimer = setTimeout(show, delay)
  } else {
    show()
  }
}

function hideTicketTooltip() {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer)
    tooltipTimer = null
  }
  tooltipVisible.value = false
}

function handleTicketHover(ticket: JiraTicket, event: MouseEvent, delay: number = 0) {
  emit('prefetch', ticket.key)
  showTicketTooltip(ticket, event, delay)
}

onBeforeUnmount(() => {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer)
    tooltipTimer = null
  }
})
</script>

<template>
  <aside
    class="relative h-screen w-full overflow-hidden border-r border-white/[0.06] bg-surface-1/80 backdrop-blur-lg transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col"
  >
    <!-- Sidebar header -->
    <div class="flex items-center border-b border-white/[0.04]" :class="collapsed ? 'flex-col gap-1 px-2 py-3' : 'justify-between px-4 py-4'">
      <div v-if="!collapsed" class="flex min-w-0 flex-1 flex-col gap-2">
        <button class="flex items-center min-w-0 hover:opacity-80 transition-opacity self-start" @click="emit('home')">
          <span class="font-display text-base text-white truncate">BetterJira!</span>
        </button>
      </div>
      <div class="flex items-center gap-0.5" :class="collapsed ? 'flex-col' : ''">
        <button
          class="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all"
          title="Settings"
          @click="emit('settings')"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
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

      <div class="rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5">
        <div class="grid grid-cols-2 gap-1">
          <button
            type="button"
            class="flex items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-medium transition-all"
            :class="ticketScope === 'currentSprint'
              ? 'bg-indigo-500/[0.12] text-indigo-200'
              : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'"
            @click="ticketScope = 'currentSprint'"
          >
            <span>Current sprint</span>
            <span class="text-[9px] opacity-70">{{ currentSprintSidebarTicketCount }}</span>
          </button>
          <button
            type="button"
            class="flex items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-medium transition-all"
            :class="ticketScope === 'all'
              ? 'bg-indigo-500/[0.12] text-indigo-200'
              : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'"
            @click="ticketScope = 'all'"
          >
            <span>All items</span>
            <span class="text-[9px] opacity-70">{{ sidebarScopedTickets.length }}</span>
          </button>
        </div>
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
            v-if="filterSpaces.length > 0 && !showFilters"
            class="truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400 max-w-[110px]"
          >
            {{ getSpaceName(filterSpaces[0]) }}<template v-if="filterSpaces.length > 1"> +{{ filterSpaces.length - 1 }}</template>
          </span>
          <span
            v-if="filterTypes.length > 0 && !showFilters"
            class="truncate rounded-full border px-1.5 py-0.5 text-[9px] font-medium max-w-[80px]"
            :class="getFilterChipClass(filterTypes[0])"
          >
            {{ filterTypes[0] }}<template v-if="filterTypes.length > 1"> +{{ filterTypes.length - 1 }}</template>
          </span>
          <span
            v-if="filterStatuses.length > 0 && !showFilters"
            class="truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400 max-w-[80px]"
          >
            {{ filterStatuses[0] }}<template v-if="filterStatuses.length > 1"> +{{ filterStatuses.length - 1 }}</template>
          </span>
          <span
            v-if="filterAssignees.length > 0 && !showFilters"
            class="truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400 max-w-[110px]"
          >
            {{ filterAssignees[0] }}<template v-if="filterAssignees.length > 1"> +{{ filterAssignees.length - 1 }}</template>
          </span>
          <span
            v-if="showCompletedTickets && !showFilters"
            class="truncate rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[9px] text-emerald-200 max-w-[110px]"
          >
            Show completed
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
        <div class="space-y-1">
          <div class="flex items-center justify-between gap-2 px-0.5">
            <span class="text-[9px] uppercase tracking-[0.12em] text-slate-600 font-medium">Sort</span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-medium transition-all"
              :class="sortReversed
                ? 'border-indigo-500/20 bg-indigo-500/[0.1] text-indigo-300'
                : 'border-white/[0.06] bg-white/[0.03] text-slate-500 hover:text-slate-300 hover:border-white/[0.1]'"
              :title="sortReversed ? 'Restore normal sort' : 'Reverse sort'"
              @click="sortReversed = !sortReversed"
            >
              <svg
                class="h-3 w-3 transition-transform"
                :class="sortReversed ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V8m0 0 3 3m-3-3-3 3m10-3v8m0 0 3-3m-3 3-3-3" />
              </svg>
              {{ sortReversed ? 'Reversed' : 'Normal' }}
            </button>
          </div>
          <select
            v-model="sortBy"
            class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-[10px] text-slate-300 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
          >
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

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
          <div>
            <div class="mb-1 flex items-center justify-between gap-2 px-0.5">
              <div class="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-600">Visibility</div>
            </div>
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[10px] transition-all"
              :class="showCompletedTickets
                ? 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-200'
                : 'border-white/[0.06] bg-white/[0.03] text-slate-500 hover:border-white/[0.1] hover:text-slate-300'"
              @click="showCompletedTickets = !showCompletedTickets"
            >
              <span>Show completed</span>
              <span
                class="relative h-4 w-7 rounded-full transition-colors"
                :class="showCompletedTickets ? 'bg-emerald-400/70' : 'bg-white/[0.08]'"
              >
                <span
                  class="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                  :class="showCompletedTickets ? 'translate-x-3' : 'translate-x-0'"
                />
              </span>
            </button>
          </div>

          <!-- Space filter -->
          <div>
            <div class="mb-1 flex items-center justify-between gap-2 px-0.5">
              <div class="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-600">Space</div>
              <button
                v-if="filterSpaces.length > 0"
                type="button"
                class="text-[9px] text-slate-500 transition-colors hover:text-slate-300"
                @click="filterSpaces = []"
              >
                All spaces
              </button>
            </div>
            <div class="flex flex-wrap gap-1">
              <button
                type="button"
                class="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all"
                :class="filterSpaces.length === 0
                  ? 'border-white/[0.15] bg-white/[0.06] text-slate-200 ring-1 ring-white/10'
                  : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.1] bg-transparent'"
                @click="filterSpaces = []"
              >
                All spaces
              </button>
              <button
                v-for="space in spaces"
                :key="space.key"
                type="button"
                class="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all"
                :class="filterSpaces.includes(space.key)
                  ? 'border-white/[0.15] bg-white/[0.06] text-slate-200 ring-1 ring-white/10'
                  : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.1] bg-transparent'"
                @click="toggleSpaceFilter(space.key)"
              >
                {{ space.name }}
              </button>
            </div>
          </div>

          <!-- Type filter -->
          <div>
            <div class="text-[9px] uppercase tracking-[0.12em] text-slate-600 font-medium mb-1 px-0.5">Type</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="type in issueTypes"
                :key="type"
                class="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all"
                :class="filterTypes.includes(type)
                  ? getFilterChipClass(type) + ' ring-1 ring-white/10'
                  : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.1] bg-transparent'"
                @click="toggleTypeFilter(type)"
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
                :class="filterStatuses.includes(status)
                  ? 'border-white/[0.15] bg-white/[0.06] text-slate-200 ring-1 ring-white/10'
                  : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.1] bg-transparent'"
                @click="toggleStatusFilter(status)"
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
      <div v-if="isSearching || hasActiveFilters || ticketScope === 'currentSprint'" class="px-0.5 pb-1 text-[10px] text-slate-600">
        {{ visibleSummary }}
      </div>
    </div>

    <!-- Collapsed state: just dots -->
    <div v-if="collapsed" class="sidebar-scrollbar scrollbar-gutter-stable flex-1 overflow-y-auto py-3 px-2 space-y-1.5" @scroll="hideTicketTooltip()">
      <div v-if="hasPinnedTickets" class="space-y-1.5">
        <button
          v-for="ticket in pinnedTickets"
          :key="ticket.key"
          class="w-full flex items-center justify-center p-1.5 rounded-lg transition-all"
          :class="selectedKey === ticket.key ? 'bg-amber-500/[0.12]' : 'hover:bg-amber-500/[0.06]'"
          @click="emit('select', ticket.key)"
          @mouseenter="handleTicketHover(ticket, $event, 0)"
          @mouseleave="hideTicketTooltip()"
        >
          <span class="flex items-center gap-1">
            <svg class="h-2.5 w-2.5 text-amber-300" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path transform="translate(-1 0) scale(1.08 1)" d="M15.75 3a.75.75 0 0 1 .53 1.28L15 5.56V9.5l2.78 2.78A.75.75 0 0 1 17.25 13H13.5v7.25a.75.75 0 0 1-1.5 0V13H8.25a.75.75 0 0 1-.53-1.28L10.5 9.5V5.56L9.22 4.28A.75.75 0 0 1 9.75 3h6Z" />
            </svg>
            <span
              class="h-2 w-2 rounded-[2px] border flex-shrink-0"
              :class="getPriorityIndicatorClass(ticket.priority)"
            ></span>
          </span>
        </button>
      </div>

      <div v-if="hasPinnedTickets && collapsedTickets.length > 0" class="mx-2 border-t border-white/[0.06]"></div>

      <button
        v-for="ticket in collapsedTickets"
        :key="ticket.key"
        class="w-full flex items-center justify-center p-1.5 rounded-lg transition-all"
        :class="selectedKey === ticket.key ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'"
        @click="emit('select', ticket.key)"
        @mouseenter="handleTicketHover(ticket, $event, 0)"
        @mouseleave="hideTicketTooltip()"
      >
        <span class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full" :class="getAccentDot(ticket.issueType)"></span>
          <span
            class="h-2 w-2 rounded-[2px] border flex-shrink-0"
            :class="getPriorityIndicatorClass(ticket.priority)"
          ></span>
        </span>
      </button>
    </div>

    <!-- Expanded state: full tree (or flat results when searching) -->
    <div v-else class="sidebar-scrollbar scrollbar-gutter-stable flex-1 overflow-y-auto py-2 scroll-smooth" @scroll="hideTicketTooltip()">
      <div v-if="hasPinnedTickets" class="mb-3">
        <div class="px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] text-amber-300/80 font-medium">
          Pinned
        </div>

        <div
          v-for="ticket in pinnedTickets"
          :key="ticket.key"
          class="flex items-center gap-2 pr-2"
        >
          <button
            class="flex-1 flex items-center gap-2 px-4 py-2 text-left transition-all group"
            :class="selectedKey === ticket.key
              ? 'bg-amber-500/[0.08] text-amber-200'
              : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'"
            @click="emit('select', ticket.key)"
            @mouseenter="handleTicketHover(ticket, $event, 700)"
            @mouseleave="hideTicketTooltip()"
          >
            <svg class="h-3.5 w-3.5 flex-shrink-0 text-amber-300" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path transform="translate(-1 0) scale(1.08 1)" d="M15.75 3a.75.75 0 0 1 .53 1.28L15 5.56V9.5l2.78 2.78A.75.75 0 0 1 17.25 13H13.5v7.25a.75.75 0 0 1-1.5 0V13H8.25a.75.75 0 0 1-.53-1.28L10.5 9.5V5.56L9.22 4.28A.75.75 0 0 1 9.75 3h6Z" />
            </svg>
            <span
              class="h-1.5 w-1.5 rounded-[2px] border flex-shrink-0"
              :class="getPriorityIndicatorClass(ticket.priority)"
              :title="ticket.priority || 'No priority'"
            ></span>
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

          <button
            class="flex-shrink-0 rounded-lg p-1.5 text-amber-300/80 hover:bg-amber-500/[0.08] hover:text-amber-200 transition-all"
            :title="`Unpin ${ticket.key}`"
            @click="togglePinnedTicket(ticket.key)"
          >
            <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path transform="translate(-1 0) scale(1.08 1)" d="M15.75 3a.75.75 0 0 1 .53 1.28L15 5.56V9.5l2.78 2.78A.75.75 0 0 1 17.25 13H13.5v7.25a.75.75 0 0 1-1.5 0V13H8.25a.75.75 0 0 1-.53-1.28L10.5 9.5V5.56L9.22 4.28A.75.75 0 0 1 9.75 3h6Z" />
            </svg>
          </button>
        </div>
      </div>

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
            @mouseenter="handleTicketHover(ticket, $event, 700)"
            @mouseleave="hideTicketTooltip()"
          >
            <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="getAccentDot(ticket.issueType)"></span>
            <span
              class="h-1.5 w-1.5 rounded-[2px] border flex-shrink-0"
              :class="getPriorityIndicatorClass(ticket.priority)"
              :title="ticket.priority || 'No priority'"
            ></span>
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

        <div v-if="!hasVisibleTickets" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">{{ emptyStateMessage }}</p>
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
          @mouseenter="handleTicketHover(ticket, $event, 700)"
          @mouseleave="hideTicketTooltip()"
        >
          <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="getAccentDot(ticket.issueType)"></span>
          <span
            class="h-1.5 w-1.5 rounded-[2px] border flex-shrink-0"
            :class="getPriorityIndicatorClass(ticket.priority)"
            :title="ticket.priority || 'No priority'"
          ></span>
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
        <div v-if="!hasVisibleTickets" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">{{ emptyStateMessage }}</p>
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
              @mouseenter="handleTicketHover(node.ticket, $event, 700)"
              @mouseleave="hideTicketTooltip()"
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
              <span
                class="h-1.5 w-1.5 rounded-[2px] border flex-shrink-0"
                :class="getPriorityIndicatorClass(node.ticket.priority)"
                :title="node.ticket.priority || 'No priority'"
              ></span>
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
                    @mouseenter="handleTicketHover(child.ticket, $event, 700)"
                    @mouseleave="hideTicketTooltip()"
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
                    <span
                      class="h-1 w-1 rounded-[2px] border flex-shrink-0"
                      :class="getPriorityIndicatorClass(child.ticket.priority)"
                      :title="child.ticket.priority || 'No priority'"
                    ></span>
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
                        @mouseenter="handleTicketHover(grandchild.ticket, $event, 700)"
                        @mouseleave="hideTicketTooltip()"
                      >
                        <span class="w-3 flex-shrink-0"></span>
                        <span class="w-1 h-1 rounded-full flex-shrink-0" :class="getAccentDot(grandchild.ticket.issueType)"></span>
                        <span
                          class="h-1 w-1 rounded-[2px] border flex-shrink-0"
                          :class="getPriorityIndicatorClass(grandchild.ticket.priority)"
                          :title="grandchild.ticket.priority || 'No priority'"
                        ></span>
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
              @mouseenter="handleTicketHover(node.ticket, $event, 700)"
              @mouseleave="hideTicketTooltip()"
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
              <span
                class="h-1.5 w-1.5 rounded-[2px] border flex-shrink-0"
                :class="getPriorityIndicatorClass(node.ticket.priority)"
                :title="node.ticket.priority || 'No priority'"
              ></span>
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
                  @mouseenter="handleTicketHover(child.ticket, $event, 700)"
                  @mouseleave="hideTicketTooltip()"
                >
                  <span class="w-3 flex-shrink-0"></span>
                  <span class="w-1 h-1 rounded-full flex-shrink-0" :class="getAccentDot(child.ticket.issueType)"></span>
                  <span
                    class="h-1 w-1 rounded-[2px] border flex-shrink-0"
                    :class="getPriorityIndicatorClass(child.ticket.priority)"
                    :title="child.ticket.priority || 'No priority'"
                  ></span>
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
            @mouseenter="handleTicketHover(node.ticket, $event, 700)"
            @mouseleave="hideTicketTooltip()"
          >
            <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="getAccentDot(node.ticket.issueType)"></span>
            <span
              class="h-1.5 w-1.5 rounded-[2px] border flex-shrink-0"
              :class="getPriorityIndicatorClass(node.ticket.priority)"
              :title="node.ticket.priority || 'No priority'"
            ></span>
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

        <div v-if="!hasVisibleTickets && isSearching" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">{{ emptyStateMessage }}</p>
          <button
            class="mt-1 text-[10px] text-indigo-400/60 hover:text-indigo-400 transition-colors"
            @click="searchQuery = ''; clearFilters()"
          >
            Clear search
          </button>
        </div>

        <!-- Empty state for filters (no search) -->
        <div v-if="!hasVisibleTickets && hasActiveFilters && !isSearching" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">{{ emptyStateMessage }}</p>
          <button
            class="mt-1 text-[10px] text-indigo-400/60 hover:text-indigo-400 transition-colors"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>

        <div v-if="!hasVisibleTickets && !hasActiveFilters && !isSearching" class="px-4 py-6 text-center">
          <p class="text-[11px] text-slate-600">{{ emptyStateMessage }}</p>
          <button
            v-if="enabledSpaceKeys.length === 0"
            class="mt-1 text-[10px] text-indigo-400/60 transition-colors hover:text-indigo-400"
            @click="emit('settings')"
          >
            Open settings
          </button>
        </div>
      </template>
    </div>

    <!-- Bottom: ticket count + refresh -->
    <div v-if="!collapsed" class="px-3 py-2.5 border-t border-white/[0.04] flex items-center justify-between">
      <span class="text-[10px] text-slate-600">
        {{ visibleSummary }}
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
    <!-- Ticket Tooltip -->
    <Teleport to="body">
      <Transition name="ticket-tooltip">
        <div
          v-if="tooltipVisible && tooltipTicket"
          class="fixed z-[9999] pointer-events-none"
          :style="{ top: tooltipPosition.top + 'px', left: tooltipPosition.left + 'px', transform: 'translateY(-50%)' }"
        >
          <div class="w-[268px] rounded-xl border border-white/[0.08] bg-[#1a1d27]/[0.97] backdrop-blur-xl shadow-2xl shadow-black/50 p-3.5 space-y-3">
            <!-- Header row: Type dot + Key + Issue type -->
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full flex-shrink-0" :class="getAccentDot(tooltipTicket.issueType)"></span>
              <span class="text-[10px] font-semibold text-slate-400 tracking-wide">{{ tooltipTicket.key }}</span>
              <span class="text-[10px] text-slate-600">&middot;</span>
              <span class="text-[10px] text-slate-500">{{ tooltipTicket.issueType }}</span>
            </div>

            <!-- Full title -->
            <div class="text-[12.5px] font-medium text-slate-200 leading-relaxed">
              {{ tooltipTicket.summary }}
            </div>

            <!-- Divider -->
            <div class="border-t border-white/[0.06]"></div>

            <!-- Meta fields -->
            <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <!-- Status -->
              <div>
                <div class="text-[9px] uppercase tracking-[0.1em] text-slate-600 font-medium mb-1">Status</div>
                <span
                  class="inline-flex items-center rounded-full border px-2 py-[3px] text-[10px] font-medium leading-none"
                  :class="getStatusBadgeClass(tooltipTicket.statusCategory)"
                >
                  {{ tooltipTicket.status }}
                </span>
              </div>

              <!-- Priority -->
              <div>
                <div class="text-[9px] uppercase tracking-[0.1em] text-slate-600 font-medium mb-1">Priority</div>
                <div class="flex items-center gap-1.5">
                  <span
                    class="h-2.5 w-2.5 rounded-[3px] border flex-shrink-0"
                    :class="getPriorityIndicatorClass(tooltipTicket.priority)"
                  ></span>
                  <span class="text-[11px] text-slate-300">{{ tooltipTicket.priority || 'None' }}</span>
                </div>
              </div>

              <!-- Assignee -->
              <div class="col-span-2">
                <div class="text-[9px] uppercase tracking-[0.1em] text-slate-600 font-medium mb-1">Assignee</div>
                <div class="flex items-center gap-1.5">
                  <div
                    class="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                    :class="tooltipTicket.assignee && tooltipTicket.assignee !== 'Unassigned'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20'
                      : 'bg-white/[0.06] text-slate-600 border border-white/[0.06]'"
                  >
                    {{ tooltipTicket.assignee && tooltipTicket.assignee !== 'Unassigned' ? tooltipTicket.assignee.charAt(0).toUpperCase() : '?' }}
                  </div>
                  <span class="text-[11px]" :class="tooltipTicket.assignee && tooltipTicket.assignee !== 'Unassigned' ? 'text-slate-300' : 'text-slate-600'">
                    {{ tooltipTicket.assignee && tooltipTicket.assignee !== 'Unassigned' ? tooltipTicket.assignee : 'Unassigned' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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

<style>
/* Tooltip transitions (unscoped because Teleport renders outside component root) */
.ticket-tooltip-enter-active {
  transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.ticket-tooltip-leave-active {
  transition: opacity 0.1s ease-out, transform 0.1s ease-out;
}
.ticket-tooltip-enter-from {
  opacity: 0;
  transform: translateY(-50%) translateX(-4px) scale(0.97);
}
.ticket-tooltip-enter-to {
  opacity: 1;
  transform: translateY(-50%) translateX(0) scale(1);
}
.ticket-tooltip-leave-from {
  opacity: 1;
  transform: translateY(-50%) translateX(0) scale(1);
}
.ticket-tooltip-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-4px) scale(0.97);
}
</style>
