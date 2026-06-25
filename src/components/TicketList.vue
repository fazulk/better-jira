<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useLocalStorage } from '@vueuse/core'
import { fetchLocalTicket } from '@/api/localTickets'
import { fetchTicket } from '@/api/jira'
import { localTicketQueryKey } from '@/composables/useLocalTicket'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import { useJiraTickets } from '@/composables/useJiraTickets'
import { useJiraCurrentUser } from '@/composables/useJiraCurrentUser'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { getLinearIssueSubtype, getStatusGroup, type JiraTicket } from '@/types/jira'
import { isLocalTicketKey } from '~/shared/localTickets'
import CreateTicketModal from './CreateTicketModal.vue'
import IssueRow from './IssueRow.vue'
import Sidebar from './Sidebar.vue'
import TicketDetail from './TicketDetail.vue'

const { tickets, fetching, refreshing, refresh } = useJiraTickets()
const queryClient = useQueryClient()
const route = useRoute()
const {
  enabledSpaces,
  hasJiraCredentialsConfigured,
  isLoading: isLoadingSpaceSettings,
} = useSpaceSettings()
const jiraMeQuery = useJiraCurrentUser(hasJiraCredentialsConfigured)

const sidebarCollapsed = useLocalStorage('jira2.sidebar.collapsed', false)
const defaultSidebarWidth = 232
const minSidebarWidth = 208
const maxSidebarWidth = 360
const collapsedSidebarWidth = 48
const sidebarWidth = useLocalStorage('jira2.sidebar.width', defaultSidebarWidth)
const currentView = useLocalStorage('jira2.currentView', 'my-issues')
const issueSearch = ref('')
const displayOptionsOpen = ref(false)
const listGrouping = useLocalStorage<'status' | 'priority' | 'none'>('jira2.linear.grouping', 'status')
const listOrdering = useLocalStorage<'priority' | 'updated' | 'created' | 'key'>('jira2.linear.ordering', 'priority')
const completedRange = useLocalStorage<'hidden' | 'week' | 'month' | 'all'>('jira2.linear.completedRange', 'hidden')
const showSubIssueContext = useLocalStorage('jira2.linear.showSubIssueContext', true)
const collapsedIssueSectionIds = useLocalStorage<string[]>('jira2.linear.collapsedIssueSectionIds', [])
const visibleIssueRowFields = useLocalStorage<IssueRowFieldId[]>('jira2.linear.visibleIssueRowFields', [
  'id',
  'status',
  'type',
  'priority',
  'assignee',
  'updated',
])
const isResizingSidebar = ref(false)
const activePointerId = ref<number | null>(null)
const isCreateModalOpen = ref(false)
const createIssueType = ref('Task')
const createParentKey = ref<string | null>(null)
const issueTypeLocked = ref(false)
const parentLocked = ref(false)
const hasFinishedInitialWorkspaceLoad = ref(false)
const commandMenuOpen = ref(false)
const commandQuery = ref('')
const commandActiveIndex = ref(0)
const displayOptionsButtonRef = ref<HTMLButtonElement | null>(null)
const displayOptionsPanelRef = ref<HTMLDivElement | null>(null)
const commandInputRef = ref<HTMLInputElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const pendingGotoKey = ref(false)
const focusedIssueKey = ref<string | null>(null)
const checkedIssueKeys = ref<string[]>([])
const selectionAnchorKey = ref<string | null>(null)
const activeInboxKey = ref<string | null>(null)
const inboxArchivedKeys = useLocalStorage<string[]>('jira2.linear.inboxArchivedKeys', [])
const inboxReadKeys = useLocalStorage<string[]>('jira2.linear.inboxReadKeys', [])
const searchResultTab = useLocalStorage<SearchResultTab>('jira2.linear.searchTab', 'all')

type SearchResultTab = 'all' | 'issues' | 'projects' | 'initiatives' | 'documents'
type IssueRowFieldId = 'id' | 'status' | 'type' | 'priority' | 'assignee' | 'created' | 'updated' | 'due' | 'parent'
type MyIssuesViewId = 'my-issues' | 'my-created' | 'my-subscribed' | 'my-activity'

interface IssueSection {
  id: string
  label: string
  tickets: JiraTicket[]
}

interface ViewTab {
  id: string
  label: string
}

interface SearchTab {
  id: SearchResultTab
  label: string
  count: number
}

interface InsightSlice {
  id: string
  label: string
  count: number
  percent: number
}

interface CommandMenuItem {
  id: string
  label: string
  description: string
  section: string
  icon?: string
  execute: () => void
}

interface InboxItem {
  ticket: JiraTicket
  actorInitials: string
  actorName: string
  summary: string
  excerpt: string
  relativeTime: string
  unread: boolean
}

interface ProjectRow {
  key: string
  name: string
  spaceKey: string
  spaceName: string
  health: 'On track' | 'At risk' | 'Completed'
  priority: string
  lead: string
  targetDate: string
  issueCount: number
  completedCount: number
  progress: number
  status: string
  updatedAt?: string
}

interface SavedViewRow {
  id: string
  name: string
  description: string
  category: string
  owner: string
  count: number
  updatedAt?: string
  icon: string
  viewId: string
}

interface InitiativeRow {
  id: string
  name: string
  description: string
  health: ProjectRow['health']
  projectCount: number
  issueCount: number
  completedCount: number
  progress: number
  lead: string
  updatedAt?: string
}

interface IssueRowFieldOption {
  id: IssueRowFieldId
  label: string
}

interface IssueRowDisplayProps {
  showId: boolean
  showStatus: boolean
  showIssueType: boolean
  showPriority: boolean
  showAssignee: boolean
  showCreated: boolean
  showUpdated: boolean
  showDue: boolean
  showParent: boolean
}

interface ProjectAccumulator {
  key: string
  name: string
  spaceKey: string
  spaceName: string
  priority: string
  lead: string
  targetDate?: string
  status: string
  updatedAt?: string
  issues: JiraTicket[]
}

const issueRowFieldOptions: IssueRowFieldOption[] = [
  { id: 'id', label: 'ID' },
  { id: 'status', label: 'Status' },
  { id: 'type', label: 'Subtype' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'created', label: 'Created' },
  { id: 'updated', label: 'Updated' },
  { id: 'due', label: 'Due date' },
  { id: 'parent', label: 'Parent' },
]

if (typeof sidebarWidth.value !== 'number' || Number.isNaN(sidebarWidth.value)) {
  sidebarWidth.value = defaultSidebarWidth
}

sidebarWidth.value = Math.min(maxSidebarWidth, Math.max(minSidebarWidth, sidebarWidth.value))

const selectedKey = computed<string | null>({
  get() {
    return typeof route.params.key === 'string' ? route.params.key : null
  },
  set(key) {
    if (key) {
      void navigateTo(`/${key}`)
      return
    }

    void navigateTo('/')
  },
})

const enabledSpaceKeys = computed(() => new Set(enabledSpaces.value.map(space => space.key)))
const enabledTickets = computed(() => tickets.value.filter(ticket => enabledSpaceKeys.value.has(ticket.spaceKey)))
const projectTicketKeySet = computed(() => {
  const keys = new Set<string>()
  for (const ticket of enabledTickets.value) {
    if (isEpicIssue(ticket)) {
      keys.add(ticket.key)
    }
  }
  return keys
})
const issueTickets = computed(() => enabledTickets.value.filter(ticket => !projectTicketKeySet.value.has(ticket.key)))
const activeTickets = computed(() => issueTickets.value.filter(isActiveIssueTicket))
const triageTickets = computed(() => issueTickets.value.filter(ticket => getStatusGroup(ticket.statusCategory) === 'new'))
const currentUserName = computed(() => jiraMeQuery.data.value?.displayName.trim() ?? '')
const assignedMyIssueTickets = computed(() => {
  const name = currentUserName.value.toLowerCase()
  if (!name) return activeTickets.value

  return activeTickets.value.filter(ticket => ticket.assignee.trim().toLowerCase() === name)
})
const createdMyIssueTickets = computed(() => {
  const name = currentUserName.value.toLowerCase()
  const localCreatedTickets = issueTickets.value.filter(ticket => isLocalTicketKey(ticket.key))
  if (!name) return localCreatedTickets

  return issueTickets.value.filter(ticket => (
    ticket.reporter?.trim().toLowerCase() === name
    || isLocalTicketKey(ticket.key)
  ))
})
const subscribedMyIssueTickets = computed(() => (
  issueTickets.value.filter(ticket => ticket.isWatching === true)
))
const activityMyIssueTickets = computed(() => {
  const keys = new Set<string>()
  const nextTickets: JiraTicket[] = []

  for (const ticket of [
    ...assignedMyIssueTickets.value,
    ...createdMyIssueTickets.value,
    ...subscribedMyIssueTickets.value,
  ]) {
    if (keys.has(ticket.key)) continue
    keys.add(ticket.key)
    nextTickets.push(ticket)
  }

  return sortTicketsByActivity(nextTickets)
})
const selectedTicket = computed(() => (
  selectedKey.value ? tickets.value.find(ticket => ticket.key === selectedKey.value) ?? null : null
))
const issueRowDisplayProps = computed<IssueRowDisplayProps>(() => ({
  showId: isIssueRowFieldVisible('id'),
  showStatus: isIssueRowFieldVisible('status'),
  showIssueType: isIssueRowFieldVisible('type'),
  showPriority: isIssueRowFieldVisible('priority'),
  showAssignee: isIssueRowFieldVisible('assignee'),
  showCreated: isIssueRowFieldVisible('created'),
  showUpdated: isIssueRowFieldVisible('updated'),
  showDue: isIssueRowFieldVisible('due'),
  showParent: isIssueRowFieldVisible('parent'),
}))

const effectiveSidebarWidth = computed(() => (
  sidebarCollapsed.value ? collapsedSidebarWidth : sidebarWidth.value
))

const showInitialWorkspaceOverlay = computed(() => (
  !hasFinishedInitialWorkspaceLoad.value
  && !isLoadingSpaceSettings.value
  && hasJiraCredentialsConfigured.value
  && fetching.value
))

const currentTeamKey = computed(() => {
  const [scope, key] = currentView.value.split(':')
  return scope === 'team' ? key ?? null : null
})

const currentTeamName = computed(() => {
  const key = currentTeamKey.value
  if (!key) return null
  return enabledSpaces.value.find(space => space.key === key)?.name ?? key
})

const currentTeamSection = computed(() => {
  const [scope, , section] = currentView.value.split(':')
  return scope === 'team' ? section ?? 'active' : null
})

const viewDirectoryIds = new Set<string>(['views', 'project-views', 'initiative-views', 'dashboards'])
const isViewsDirectory = computed(() => viewDirectoryIds.has(currentView.value))
const activeViewsDirectoryTab = computed(() => (
  viewDirectoryIds.has(currentView.value) ? currentView.value : 'views'
))
const readyQaTickets = computed(() => (
  issueTickets.value.filter(ticket => ticket.status.toLowerCase().includes('ready for qa'))
))

const currentTeamTickets = computed(() => {
  const key = currentTeamKey.value
  if (!key) return []
  return issueTickets.value.filter(ticket => ticket.spaceKey === key)
})
const isReadyQaView = computed(() => currentView.value === 'ready-qa' || currentTeamSection.value === 'ready-qa')
const isCurrentTeamAllIssuesView = computed(() => currentTeamKey.value !== null && currentTeamSection.value === 'all')

function isMyIssuesView(viewId: string): viewId is MyIssuesViewId {
  return viewId === 'my-issues'
    || viewId === 'my-created'
    || viewId === 'my-subscribed'
    || viewId === 'my-activity'
}

const viewTitle = computed(() => {
  if (selectedTicket.value) return selectedTicket.value.key
  if (currentView.value === 'inbox') return 'Inbox'
  if (isMyIssuesView(currentView.value)) return 'My issues'
  if (currentView.value === 'initiatives') return 'Initiatives'
  if (currentView.value === 'projects') return 'Projects'
  if (isViewsDirectory.value) return 'Views'
  if (currentView.value === 'search') return 'Search'
  if (currentView.value === 'ready-qa') return 'Ready for QA'
  if (currentTeamName.value) return currentTeamName.value
  return 'Issues'
})

const viewTabs = computed<ViewTab[]>(() => {
  if (isMyIssuesView(currentView.value)) {
    return [
      { id: 'my-issues', label: 'Assigned' },
      { id: 'my-created', label: 'Created' },
      { id: 'my-subscribed', label: 'Subscribed' },
      { id: 'my-activity', label: 'Activity' },
    ]
  }

  if (
    currentTeamKey.value
    && (currentTeamSection.value === 'all' || currentTeamSection.value === 'active' || currentTeamSection.value === 'backlog')
  ) {
    return [
      { id: `team:${currentTeamKey.value}:all`, label: 'All issues' },
      { id: `team:${currentTeamKey.value}:active`, label: 'Active' },
      { id: `team:${currentTeamKey.value}:backlog`, label: 'Backlog' },
    ]
  }

  if (isViewsDirectory.value) {
    return [
      { id: 'views', label: 'Issues' },
      { id: 'project-views', label: 'Projects' },
      { id: 'initiative-views', label: 'Initiatives' },
      { id: 'dashboards', label: 'Dashboards' },
    ]
  }

  return []
})

const scopedTickets = computed(() => {
  if (currentView.value === 'inbox') {
    return triageTickets.value
  }

  if (currentView.value === 'ready-qa') {
    return readyQaTickets.value
  }

  if (currentView.value === 'my-created') {
    return createdMyIssueTickets.value
  }

  if (currentView.value === 'my-subscribed') {
    return subscribedMyIssueTickets.value
  }

  if (currentView.value === 'my-activity') {
    return activityMyIssueTickets.value
  }

  if (currentView.value === 'my-issues') {
    return assignedMyIssueTickets.value
  }

  if (currentTeamKey.value) {
    const teamTickets = currentTeamTickets.value
    if (currentTeamSection.value === 'triage') {
      return teamTickets.filter(ticket => getStatusGroup(ticket.statusCategory) === 'new')
    }
    if (currentTeamSection.value === 'backlog') {
      return teamTickets.filter(isBacklogIssueTicket)
    }
    if (currentTeamSection.value === 'ready-qa') {
      return teamTickets.filter(ticket => ticket.status.toLowerCase().includes('ready for qa'))
    }
    if (currentTeamSection.value === 'all') {
      return teamTickets
    }
    return teamTickets.filter(isActiveIssueTicket)
  }

  return issueTickets.value
})

const normalizedIssueSearch = computed(() => issueSearch.value.trim().toLowerCase())

const searchedTickets = computed(() => {
  const query = currentView.value === 'search' ? normalizedIssueSearch.value : ''
  const baseTickets = currentView.value === 'search'
    ? filterTicketsByCompletedRange(issueTickets.value)
    : filterTicketsForCurrentView(scopedTickets.value)
  if (!query) return baseTickets

  return baseTickets.filter(ticket => ticketMatchesQuery(ticket, query))
})

const searchedProjectRows = computed(() => {
  const query = normalizedIssueSearch.value
  if (!query) return projectRows.value

  return projectRows.value.filter(project => [
    project.key,
    project.name,
    project.spaceKey,
    project.spaceName,
    project.health,
    project.priority,
    project.lead,
    project.status,
  ].some(value => value.toLowerCase().includes(query)))
})

const searchedInitiativeRows = computed(() => {
  const query = normalizedIssueSearch.value
  if (!query) return initiativeRows.value

  return initiativeRows.value.filter(initiative => [
    initiative.name,
    initiative.description,
    initiative.health,
    initiative.lead,
  ].some(value => value.toLowerCase().includes(query)))
})

const searchTabs = computed<SearchTab[]>(() => [
  {
    id: 'all',
    label: 'All',
    count: searchedTickets.value.length + searchedProjectRows.value.length + searchedInitiativeRows.value.length,
  },
  {
    id: 'issues',
    label: 'Issues',
    count: searchedTickets.value.length,
  },
  {
    id: 'projects',
    label: 'Projects',
    count: searchedProjectRows.value.length,
  },
  {
    id: 'initiatives',
    label: 'Initiatives',
    count: searchedInitiativeRows.value.length,
  },
  {
    id: 'documents',
    label: 'Documents',
    count: 0,
  },
])

const issueSections = computed<IssueSection[]>(() => {
  if (isMyIssuesView(currentView.value)) {
    const label = currentView.value === 'my-created'
      ? 'Created by you'
      : currentView.value === 'my-subscribed'
        ? 'Subscribed'
        : currentView.value === 'my-activity'
          ? 'Recent activity'
          : 'Assigned to you'

    return [{
      id: currentView.value,
      label,
      tickets: currentView.value === 'my-activity' ? searchedTickets.value : sortTickets(searchedTickets.value),
    }]
  }

  if (listGrouping.value === 'none' || currentView.value === 'search') {
    return [{
      id: 'all',
      label: searchedTickets.value.length === 1 ? '1 issue' : `${searchedTickets.value.length} issues`,
      tickets: sortTickets(searchedTickets.value),
    }]
  }

  if (listGrouping.value === 'priority') {
    return groupTickets(searchedTickets.value, ticket => ticket.priority || 'No priority', getPriorityRank)
  }

  return groupTickets(searchedTickets.value, ticket => ticket.status || 'No status', () => 0)
})

const visibleIssueCount = computed(() => issueSections.value.reduce((count, section) => count + section.tickets.length, 0))
const hiddenCompletedCount = computed(() => (
  completedRange.value === 'all' || isCurrentTeamAllIssuesView.value
    ? 0
    : scopedTickets.value.filter(ticket => !isTicketVisibleInCompletedRange(ticket)).length
))
const readyQaInsightTickets = computed(() => (isReadyQaView.value ? searchedTickets.value : []))
const readyQaRecentlyUpdatedCount = computed(() => (
  readyQaInsightTickets.value.filter(ticket => isRecentlyUpdated(ticket.updatedAt ?? ticket.createdAt)).length
))
const readyQaUnassignedCount = computed(() => (
  readyQaInsightTickets.value.filter(ticket => !ticket.assignee || ticket.assignee === 'Unassigned').length
))
const readyQaPrioritySlices = computed(() => (
  buildInsightSlices(readyQaInsightTickets.value, ticket => ticket.priority || 'No priority')
))
const readyQaAssigneeSlices = computed(() => (
  buildInsightSlices(
    readyQaInsightTickets.value,
    ticket => ticket.assignee && ticket.assignee !== 'Unassigned' ? ticket.assignee : 'Unassigned',
  )
))
const readyQaStatusSlices = computed(() => (
  buildInsightSlices(readyQaInsightTickets.value, ticket => ticket.status || 'No status')
))
const checkedIssueKeySet = computed(() => new Set(checkedIssueKeys.value))
const checkedIssues = computed(() => (
  checkedIssueKeys.value
    .map(key => tickets.value.find(ticket => ticket.key === key))
    .filter((ticket): ticket is JiraTicket => Boolean(ticket))
))
const checkedIssueCount = computed(() => checkedIssueKeys.value.length)
const inboxArchivedKeySet = computed(() => new Set(inboxArchivedKeys.value))
const inboxReadKeySet = computed(() => new Set(inboxReadKeys.value))

const inboxItems = computed<InboxItem[]>(() => (
  sortTicketsByActivity(triageTickets.value)
    .filter(ticket => !inboxArchivedKeySet.value.has(ticket.key))
    .slice(0, 100)
    .map(ticket => ({
      ticket,
      actorInitials: getInitials(ticket.assignee || ticket.spaceName || ticket.spaceKey),
      actorName: ticket.assignee && ticket.assignee !== 'Unassigned' ? ticket.assignee : ticket.spaceName,
      summary: `${ticket.key} moved to ${ticket.status}`,
      excerpt: ticket.summary,
      relativeTime: getRelativeTimeLabel(ticket.updatedAt ?? ticket.createdAt),
      unread: isRecentlyUpdated(ticket.updatedAt ?? ticket.createdAt) && !inboxReadKeySet.value.has(ticket.key),
    }))
))
const inboxUnreadCount = computed(() => inboxItems.value.filter(item => item.unread).length)
const inboxArchivedCount = computed(() => inboxArchivedKeys.value.length)

const activeInboxItem = computed(() => {
  const key = activeInboxKey.value
  return key ? inboxItems.value.find(item => item.ticket.key === key) ?? null : inboxItems.value[0] ?? null
})
const activeInboxParent = computed(() => activeInboxItem.value?.ticket.parent ?? null)
const activeInboxProjectParent = computed(() => {
  const parent = activeInboxParent.value
  if (!parent || !parent.issueType.toLowerCase().includes('epic')) return null
  return parent
})
const activeInboxIssueParent = computed(() => {
  const parent = activeInboxParent.value
  if (!parent || parent.issueType.toLowerCase().includes('epic')) return null
  return parent
})

const projectRows = computed<ProjectRow[]>(() => {
  const projects = new Map<string, ProjectAccumulator>()

  for (const ticket of enabledTickets.value) {
    const projectKey = getProjectKey(ticket)
    if (!projectKey) continue

    const existing = projects.get(projectKey)
    const sourceTicket = getProjectSourceTicket(ticket, projectKey)
    const nextProject = existing ?? {
      key: projectKey,
      name: sourceTicket?.summary ?? ticket.parent?.summary ?? ticket.summary,
      spaceKey: sourceTicket?.spaceKey ?? ticket.spaceKey,
      spaceName: sourceTicket?.spaceName ?? ticket.spaceName,
      priority: sourceTicket?.priority ?? ticket.priority,
      lead: sourceTicket?.assignee ?? ticket.assignee,
      targetDate: sourceTicket?.dueDate ?? ticket.dueDate,
      status: sourceTicket?.status ?? ticket.status,
      updatedAt: sourceTicket?.updatedAt ?? ticket.updatedAt,
      issues: [],
    }

    if (!existing && sourceTicket) {
      nextProject.priority = sourceTicket.priority
      nextProject.lead = sourceTicket.assignee
      nextProject.targetDate = sourceTicket.dueDate
      nextProject.status = sourceTicket.status
      nextProject.updatedAt = sourceTicket.updatedAt
    }

    if (ticket.key !== projectKey) {
      nextProject.issues = [...nextProject.issues, ticket]
    }
    if (!nextProject.targetDate && ticket.dueDate) {
      nextProject.targetDate = ticket.dueDate
    }
    if (getTimeValue(ticket.updatedAt) > getTimeValue(nextProject.updatedAt)) {
      nextProject.updatedAt = ticket.updatedAt
    }
    projects.set(projectKey, nextProject)
  }

  return [...projects.values()]
    .map(project => {
      const issueCount = project.issues.length
      const completedCount = project.issues.filter(ticket => getStatusGroup(ticket.statusCategory) === 'done').length
      const progress = issueCount > 0 ? Math.round((completedCount / issueCount) * 100) : 0

      return {
        key: project.key,
        name: project.name,
        spaceKey: project.spaceKey,
        spaceName: project.spaceName,
        health: getProjectHealth(project.status, progress),
        priority: project.priority || 'No priority',
        lead: project.lead && project.lead !== 'Unassigned' ? project.lead : 'Unassigned',
        targetDate: formatCompactDate(project.targetDate),
        issueCount,
        completedCount,
        progress,
        status: project.status,
        updatedAt: project.updatedAt,
      }
    })
    .sort((left, right) => (
      getProjectHealthRank(left.health) - getProjectHealthRank(right.health)
      || getPriorityRank(left.priority) - getPriorityRank(right.priority)
      || getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt)
      || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    ))
})

const displayedProjectRows = computed(() => {
  const key = currentTeamKey.value
  if (currentTeamSection.value !== 'projects' || !key) {
    return projectRows.value
  }

  return projectRows.value.filter(project => project.spaceKey === key)
})

const initiativeRows = computed<InitiativeRow[]>(() => {
  const groups: Array<{
    id: string
    name: string
    description: string
    health: ProjectRow['health']
    projects: ProjectRow[]
  }> = [
    {
      id: 'at-risk',
      name: 'At risk delivery',
      description: 'Project groups that are blocked or have very low completion',
      health: 'At risk',
      projects: projectRows.value.filter(project => project.health === 'At risk'),
    },
    {
      id: 'on-track',
      name: 'Active delivery',
      description: 'Project groups progressing without an at-risk signal',
      health: 'On track',
      projects: projectRows.value.filter(project => project.health === 'On track'),
    },
    {
      id: 'completed',
      name: 'Completed delivery',
      description: 'Project groups marked complete or fully delivered',
      health: 'Completed',
      projects: projectRows.value.filter(project => project.health === 'Completed'),
    },
  ]

  return groups
    .filter(group => group.projects.length > 0)
    .map(group => {
      const issueCount = group.projects.reduce((count, project) => count + project.issueCount, 0)
      const completedCount = group.projects.reduce((count, project) => count + project.completedCount, 0)
      const progress = issueCount > 0 ? Math.round((completedCount / issueCount) * 100) : 0

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        health: group.health,
        projectCount: group.projects.length,
        issueCount,
        completedCount,
        progress,
        lead: getMostCommonLead(group.projects),
        updatedAt: group.projects
          .map(project => project.updatedAt)
          .sort((left, right) => getTimeValue(right) - getTimeValue(left))[0],
      }
    })
})

const savedViewRows = computed<SavedViewRow[]>(() => {
  if (activeViewsDirectoryTab.value === 'project-views') {
    const atRiskProjects = projectRows.value.filter(project => project.health === 'At risk')
    const completedProjects = projectRows.value.filter(project => project.health === 'Completed')

    return [
      {
        id: 'all-projects',
        name: 'All projects',
        description: 'Every project across enabled teams',
        category: 'Projects',
        owner: 'Workspace',
        count: projectRows.value.length,
        updatedAt: projectRows.value[0]?.updatedAt,
        icon: '◈',
        viewId: 'projects',
      },
      {
        id: 'at-risk-projects',
        name: 'At risk projects',
        description: 'Projects with blocked status or very low completion',
        category: 'Projects',
        owner: 'Workspace',
        count: atRiskProjects.length,
        updatedAt: atRiskProjects[0]?.updatedAt,
        icon: '◇',
        viewId: 'projects',
      },
      {
        id: 'completed-projects',
        name: 'Completed projects',
        description: 'Projects where all tracked issues are complete',
        category: 'Projects',
        owner: 'Workspace',
        count: completedProjects.length,
        updatedAt: completedProjects[0]?.updatedAt,
        icon: '◆',
        viewId: 'projects',
      },
    ]
  }

  if (activeViewsDirectoryTab.value === 'initiative-views') {
    return [
      {
        id: 'workspace-initiatives',
        name: 'Workspace initiatives',
        description: 'Roadmap rollups across active projects',
        category: 'Initiatives',
        owner: 'Workspace',
        count: initiativeRows.value.length,
        updatedAt: initiativeRows.value[0]?.updatedAt,
        icon: '◇',
        viewId: 'initiatives',
      },
    ]
  }

  if (activeViewsDirectoryTab.value === 'dashboards') {
    return [
      {
        id: 'workspace-overview',
        name: 'Workspace overview',
        description: 'Active issues, triage, completed work, and project health',
        category: 'Dashboard',
        owner: 'Workspace',
        count: issueTickets.value.length,
        updatedAt: sortTicketsByActivity(issueTickets.value)[0]?.updatedAt,
        icon: '▦',
        viewId: 'my-issues',
      },
      {
        id: 'qa-readiness',
        name: 'QA readiness',
        description: 'Issues waiting for validation across enabled teams',
        category: 'Dashboard',
        owner: 'Quality',
        count: readyQaTickets.value.length,
        updatedAt: sortTicketsByActivity(readyQaTickets.value)[0]?.updatedAt,
        icon: '◌',
        viewId: 'ready-qa',
      },
    ]
  }

  const teamRows = enabledSpaces.value.map<SavedViewRow>(space => {
    const teamTickets = activeTickets.value.filter(ticket => ticket.spaceKey === space.key)
    return {
      id: `team-${space.key}-active`,
      name: `${space.name || space.key} active issues`,
      description: `Current issue work for ${space.key}`,
      category: 'Team',
      owner: space.name || space.key,
      count: teamTickets.length,
      updatedAt: sortTicketsByActivity(teamTickets)[0]?.updatedAt,
      icon: '◎',
      viewId: `team:${space.key}:active`,
    }
  })

  return [
    {
      id: 'ready-qa',
      name: 'Ready for QA',
      description: 'Issues awaiting QA review across enabled teams',
      category: 'Issues',
      owner: 'Quality',
      count: readyQaTickets.value.length,
      updatedAt: sortTicketsByActivity(readyQaTickets.value)[0]?.updatedAt,
      icon: '●',
      viewId: 'ready-qa',
    },
    {
      id: 'my-active-issues',
      name: 'My active issues',
      description: 'Assigned and active issue work',
      category: 'Issues',
      owner: 'Me',
      count: activeTickets.value.length,
      updatedAt: sortTicketsByActivity(activeTickets.value)[0]?.updatedAt,
      icon: '◎',
      viewId: 'my-issues',
    },
    {
      id: 'inbox-triage',
      name: 'Inbox triage',
      description: 'New issues and updates that need attention',
      category: 'Issues',
      owner: 'Workspace',
      count: triageTickets.value.length,
      updatedAt: sortTicketsByActivity(triageTickets.value)[0]?.updatedAt,
      icon: '▤',
      viewId: 'inbox',
    },
    ...teamRows,
  ].sort((left, right) => (
    getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt)
    || left.name.localeCompare(right.name)
  ))
})

const teamSavedViewRows = computed<SavedViewRow[]>(() => {
  const key = currentTeamKey.value
  const name = currentTeamName.value
  if (!key || !name) return []

  const teamTickets = currentTeamTickets.value
  const teamActiveTickets = teamTickets.filter(isActiveIssueTicket)
  const teamTriageTickets = teamTickets.filter(ticket => getStatusGroup(ticket.statusCategory) === 'new')
  const teamBacklogTickets = teamTickets.filter(isBacklogIssueTicket)
  const teamReadyQaTickets = teamTickets.filter(ticket => ticket.status.toLowerCase().includes('ready for qa'))
  const teamProjectRows = projectRows.value.filter(project => project.spaceKey === key)

  return [
    {
      id: `team-${key}-active`,
      name: 'Active issues',
      description: `Current issue work for ${key}`,
      category: 'Issues',
      owner: name,
      count: teamActiveTickets.length,
      updatedAt: sortTicketsByActivity(teamActiveTickets)[0]?.updatedAt,
      icon: '◌',
      viewId: `team:${key}:active`,
    },
    {
      id: `team-${key}-triage`,
      name: 'Triage',
      description: 'New issues and intake candidates',
      category: 'Issues',
      owner: name,
      count: teamTriageTickets.length,
      updatedAt: sortTicketsByActivity(teamTriageTickets)[0]?.updatedAt,
      icon: '○',
      viewId: `team:${key}:triage`,
    },
    {
      id: `team-${key}-backlog`,
      name: 'Backlog',
      description: 'Issues outside the current sprint',
      category: 'Issues',
      owner: name,
      count: teamBacklogTickets.length,
      updatedAt: sortTicketsByActivity(teamBacklogTickets)[0]?.updatedAt,
      icon: '□',
      viewId: `team:${key}:backlog`,
    },
    {
      id: `team-${key}-ready-qa`,
      name: 'Ready for QA',
      description: 'Team issues waiting for validation',
      category: 'Issues',
      owner: 'Quality',
      count: teamReadyQaTickets.length,
      updatedAt: sortTicketsByActivity(teamReadyQaTickets)[0]?.updatedAt,
      icon: '●',
      viewId: `team:${key}:ready-qa`,
    },
    {
      id: `team-${key}-projects`,
      name: 'Projects',
      description: 'Team projects',
      category: 'Projects',
      owner: name,
      count: teamProjectRows.length,
      updatedAt: teamProjectRows[0]?.updatedAt,
      icon: '◈',
      viewId: `team:${key}:projects`,
    },
  ].sort((left, right) => (
    getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt)
    || left.name.localeCompare(right.name)
  ))
})

const displayedSavedViewRows = computed(() => (
  currentTeamSection.value === 'views' ? teamSavedViewRows.value : savedViewRows.value
))

const commandSearchQuery = computed(() => commandQuery.value.trim().toLowerCase())

const navigationCommands = computed<CommandMenuItem[]>(() => {
  const teamCommands = enabledSpaces.value.flatMap<CommandMenuItem>(space => [
    {
      id: `team:${space.key}:active`,
      label: `${space.name || space.key} issues`,
      description: `Open active issues for ${space.key}`,
      section: 'Teams',
      icon: space.key.slice(0, 1).toUpperCase(),
      execute: () => handleViewChange(`team:${space.key}:active`),
    },
    {
      id: `team:${space.key}:triage`,
      label: `${space.name || space.key} triage`,
      description: `Open triage for ${space.key}`,
      section: 'Teams',
      icon: space.key.slice(0, 1).toUpperCase(),
      execute: () => handleViewChange(`team:${space.key}:triage`),
    },
    {
      id: `team:${space.key}:projects`,
      label: `${space.name || space.key} projects`,
      description: `Open projects for ${space.key}`,
      section: 'Teams',
      icon: '◈',
      execute: () => handleViewChange(`team:${space.key}:projects`),
    },
    {
      id: `team:${space.key}:views`,
      label: `${space.name || space.key} views`,
      description: `Open saved views for ${space.key}`,
      section: 'Teams',
      icon: '◌',
      execute: () => handleViewChange(`team:${space.key}:views`),
    },
  ])

  return [
    {
      id: 'create',
      label: 'Create issue',
      description: 'Open the new issue composer',
      section: 'Actions',
      icon: '＋',
      execute: () => openGlobalCreate(),
    },
    {
      id: 'refresh',
      label: 'Sync Jira',
      description: 'Refresh issues and selected issue details',
      section: 'Actions',
      icon: '↻',
      execute: () => {
        void handleRefresh()
      },
    },
    {
      id: 'inbox',
      label: 'Inbox',
      description: 'Open workspace inbox',
      section: 'Navigation',
      icon: '▤',
      execute: () => handleViewChange('inbox'),
    },
    {
      id: 'my-issues',
      label: 'My issues',
      description: 'Open assigned active issues',
      section: 'Navigation',
      icon: '◎',
      execute: () => handleViewChange('my-issues'),
    },
    {
      id: 'search',
      label: 'Search',
      description: 'Open workspace search',
      section: 'Navigation',
      icon: '⌕',
      execute: () => handleViewChange('search'),
    },
    {
      id: 'ready-qa',
      label: 'Ready for QA',
      description: 'Open the saved QA view',
      section: 'Navigation',
      icon: '●',
      execute: () => handleViewChange('ready-qa'),
    },
    {
      id: 'initiatives',
      label: 'Initiatives',
      description: 'Open roadmap rollups',
      section: 'Navigation',
      icon: '◇',
      execute: () => handleViewChange('initiatives'),
    },
    {
      id: 'projects',
      label: 'Projects',
      description: 'Open project table',
      section: 'Navigation',
      icon: '◈',
      execute: () => handleViewChange('projects'),
    },
    {
      id: 'views',
      label: 'Views',
      description: 'Open saved views',
      section: 'Navigation',
      icon: '◌',
      execute: () => handleViewChange('views'),
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Open workspace settings',
      section: 'Navigation',
      icon: '⚙',
      execute: openSettings,
    },
    ...teamCommands,
  ]
})

const issueCommandItems = computed<CommandMenuItem[]>(() => {
  const query = commandSearchQuery.value
  const baseTickets = query
    ? issueTickets.value.filter(ticket => [
      ticket.key,
      ticket.summary,
      ticket.status,
      ticket.priority,
      ticket.assignee,
      ticket.spaceKey,
      ticket.spaceName,
    ].some(value => value?.toLowerCase().includes(query)))
    : scopedTickets.value

  return sortTickets(baseTickets).slice(0, 20).map(ticket => ({
    id: `issue:${ticket.key}`,
    label: ticket.summary,
    description: `${ticket.key} · ${ticket.status} · ${ticket.assignee || 'Unassigned'}`,
    section: 'Issues',
    icon: getIssueTypeIcon(ticket.issueType),
    execute: () => openTicket(ticket.key),
  }))
})

const commandItems = computed<CommandMenuItem[]>(() => {
  const query = commandSearchQuery.value
  const navigationItems = query
    ? navigationCommands.value.filter(item => [
      item.label,
      item.description,
      item.section,
    ].some(value => value?.toLowerCase().includes(query)))
    : navigationCommands.value

  return [...navigationItems, ...issueCommandItems.value].slice(0, 40)
})

watchEffect(() => {
  if (hasFinishedInitialWorkspaceLoad.value) {
    return
  }

  if (isLoadingSpaceSettings.value || !hasJiraCredentialsConfigured.value) {
    return
  }

  if (!fetching.value) {
    hasFinishedInitialWorkspaceLoad.value = true
  }
})

watch(selectedKey, key => {
  if (key) {
    focusedIssueKey.value = key
    displayOptionsOpen.value = false
  }
})

watch(commandMenuOpen, isOpen => {
  if (!isOpen) return
  commandActiveIndex.value = 0
  nextTick(() => {
    commandInputRef.value?.focus()
  })
})

watch(commandSearchQuery, () => {
  commandActiveIndex.value = 0
})

watch(commandItems, items => {
  if (commandActiveIndex.value >= items.length) {
    commandActiveIndex.value = Math.max(items.length - 1, 0)
  }
})

watch([issueSections, collapsedIssueSectionIds], () => {
  const flatTickets = getFlatVisibleTickets()
  if (!flatTickets.length) {
    focusedIssueKey.value = null
    selectionAnchorKey.value = null
    return
  }

  if (!focusedIssueKey.value || !flatTickets.some(ticket => ticket.key === focusedIssueKey.value)) {
    focusedIssueKey.value = flatTickets[0]?.key ?? null
  }

  if (selectionAnchorKey.value && !flatTickets.some(ticket => ticket.key === selectionAnchorKey.value)) {
    selectionAnchorKey.value = null
  }
}, { immediate: true })

watch(inboxItems, items => {
  if (!items.length) {
    activeInboxKey.value = null
    return
  }

  if (!activeInboxKey.value || !items.some(item => item.ticket.key === activeInboxKey.value)) {
    activeInboxKey.value = items[0]?.ticket.key ?? null
  }
}, { immediate: true })

function groupTickets(
  nextTickets: JiraTicket[],
  getLabel: (ticket: JiraTicket) => string,
  getRank: (label: string) => number,
): IssueSection[] {
  const groups = new Map<string, JiraTicket[]>()
  for (const ticket of nextTickets) {
    const label = getLabel(ticket)
    groups.set(label, [...groups.get(label) ?? [], ticket])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => getRank(left) - getRank(right) || left.localeCompare(right))
    .map(([label, sectionTickets]) => ({
      id: label,
      label,
      tickets: sortTickets(sectionTickets),
    }))
}

function sortTickets(nextTickets: JiraTicket[]): JiraTicket[] {
  return [...nextTickets].sort((left, right) => {
    if (listOrdering.value === 'updated') {
      return getTimeValue(right.updatedAt ?? right.createdAt) - getTimeValue(left.updatedAt ?? left.createdAt)
        || getPriorityRank(left.priority) - getPriorityRank(right.priority)
        || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'created') {
      return getTimeValue(right.createdAt) - getTimeValue(left.createdAt)
        || getPriorityRank(left.priority) - getPriorityRank(right.priority)
        || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'key') {
      return left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    return getStatusRank(left.statusCategory) - getStatusRank(right.statusCategory)
      || getPriorityRank(left.priority) - getPriorityRank(right.priority)
      || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function filterTicketsByCompletedRange(nextTickets: JiraTicket[]): JiraTicket[] {
  return nextTickets.filter(isTicketVisibleInCompletedRange)
}

function filterTicketsForCurrentView(nextTickets: JiraTicket[]): JiraTicket[] {
  if (isCurrentTeamAllIssuesView.value) return nextTickets
  return filterTicketsByCompletedRange(nextTickets)
}

function isBacklogIssueTicket(ticket: JiraTicket): boolean {
  return ticket.status.trim().toLowerCase() === 'backlog'
}

function isActiveIssueTicket(ticket: JiraTicket): boolean {
  return getStatusGroup(ticket.statusCategory) !== 'done' && !isBacklogIssueTicket(ticket)
}

function isTicketVisibleInCompletedRange(ticket: JiraTicket): boolean {
  if (getStatusGroup(ticket.statusCategory) !== 'done') return true
  if (completedRange.value === 'all') return true
  if (completedRange.value === 'hidden') return false

  const completedAt = getTimeValue(ticket.completedAt ?? ticket.updatedAt)
  if (completedAt === 0) return false

  const rangeMs = completedRange.value === 'week'
    ? 7 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000
  return Date.now() - completedAt <= rangeMs
}

function ticketMatchesQuery(ticket: JiraTicket, query: string): boolean {
  return [
    ticket.key,
    ticket.summary,
    ticket.status,
    ticket.priority,
    ticket.issueType,
    ticket.assignee,
    ticket.reporter,
    ticket.spaceKey,
    ticket.spaceName,
    ticket.parent?.key,
    ticket.parent?.summary,
  ].some(value => value?.toLowerCase().includes(query))
}

function getIssueTypeIcon(issueType: string): string {
  const subtype = getLinearIssueSubtype(issueType)
  if (subtype === 'Story') return '◇'
  if (subtype === 'Bug') return '◆'
  return '○'
}

function buildInsightSlices(
  nextTickets: JiraTicket[],
  getLabel: (ticket: JiraTicket) => string,
  limit = 5,
): InsightSlice[] {
  const counts = new Map<string, number>()
  for (const ticket of nextTickets) {
    const label = getLabel(ticket).trim() || 'None'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  const total = nextTickets.length
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => ({
      id: label,
      label,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
}

function sortTicketsByActivity(nextTickets: JiraTicket[]): JiraTicket[] {
  return [...nextTickets].sort((left, right) => (
    getTimeValue(right.updatedAt ?? right.createdAt) - getTimeValue(left.updatedAt ?? left.createdAt)
    || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
  ))
}

function getStatusRank(statusCategory: string): number {
  const group = getStatusGroup(statusCategory)
  if (group === 'indeterminate') return 0
  if (group === 'new') return 1
  return 2
}

function getPriorityRank(priority: string): number {
  const ranks: Record<string, number> = {
    highest: 0,
    high: 1,
    medium: 2,
    low: 3,
    lowest: 4,
  }
  return ranks[priority.trim().toLowerCase()] ?? 5
}

function getProjectKey(ticket: JiraTicket): string | null {
  if (isEpicIssue(ticket)) return ticket.key

  const parent = ticket.parent
  if (!parent?.key) return null
  if (isEpicIssueType(parent.issueType)) return parent.key

  const parentTicket = enabledTickets.value.find(candidate => candidate.key === parent.key)
  return parentTicket && isEpicIssue(parentTicket) ? parentTicket.key : null
}

function getProjectSourceTicket(ticket: JiraTicket, projectKey: string): JiraTicket | null {
  if (ticket.key === projectKey) return ticket
  return enabledTickets.value.find(candidate => candidate.key === projectKey) ?? null
}

function isEpicIssue(ticket: JiraTicket): boolean {
  return isEpicIssueType(ticket.issueType)
}

function isEpicIssueType(issueType: string): boolean {
  return issueType.toLowerCase().includes('epic')
}

function getProjectHealth(status: string, progress: number): ProjectRow['health'] {
  const normalizedStatus = status.toLowerCase()
  if (normalizedStatus.includes('done') || normalizedStatus.includes('complete') || progress === 100) {
    return 'Completed'
  }
  if (normalizedStatus.includes('block') || progress < 20) {
    return 'At risk'
  }
  return 'On track'
}

function getProjectHealthRank(health: ProjectRow['health']): number {
  if (health === 'At risk') return 0
  if (health === 'On track') return 1
  return 2
}

function getProjectHealthClass(health: ProjectRow['health']): string {
  if (health === 'Completed') return 'bg-[#4dbb83]/10 text-[#63c891] border-[#4dbb83]/20'
  if (health === 'At risk') return 'bg-[#e59356]/10 text-[#e9a66c] border-[#e59356]/20'
  return 'bg-[#3f9fd6]/10 text-[#6fb7de] border-[#3f9fd6]/20'
}

function getProgressBarClass(health: ProjectRow['health']): string {
  if (health === 'Completed') return 'bg-[#4dbb83]'
  if (health === 'At risk') return 'bg-[#e59356]'
  return 'bg-[#6f73ff]'
}

function getInsightBarClass(index: number): string {
  if (index === 0) return 'bg-[#6f73ff]'
  if (index === 1) return 'bg-[#4dbb83]'
  if (index === 2) return 'bg-[#e59356]'
  return 'bg-[#8f9198]'
}

function isIssueRowFieldVisible(fieldId: IssueRowFieldId): boolean {
  return visibleIssueRowFields.value.includes(fieldId)
}

function toggleIssueRowField(fieldId: IssueRowFieldId) {
  if (isIssueRowFieldVisible(fieldId)) {
    if (visibleIssueRowFields.value.length === 1) return
    visibleIssueRowFields.value = visibleIssueRowFields.value.filter(item => item !== fieldId)
    return
  }

  visibleIssueRowFields.value = [...visibleIssueRowFields.value, fieldId]
}

function getMostCommonLead(projects: ProjectRow[]): string {
  const counts = new Map<string, number>()
  for (const project of projects) {
    if (project.lead === 'Unassigned') continue
    counts.set(project.lead, (counts.get(project.lead) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? 'Unassigned'
}

function getTimeValue(value: string | undefined): number {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length > 1) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function formatCompactDate(value: string | undefined): string {
  if (!value) return 'No target'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No target'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function getRelativeTimeLabel(value: string | undefined): string {
  if (!value) return 'No date'
  const time = Date.parse(value)
  if (Number.isNaN(time)) return 'No date'

  const diffMs = time - Date.now()
  const absMs = Math.abs(diffMs)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  if (absMs < hour) return relativeFormatter.format(Math.round(diffMs / minute), 'minute')
  if (absMs < day) return relativeFormatter.format(Math.round(diffMs / hour), 'hour')
  return relativeFormatter.format(Math.round(diffMs / day), 'day')
}

function isRecentlyUpdated(value: string | undefined): boolean {
  if (!value) return false
  const time = Date.parse(value)
  if (Number.isNaN(time)) return false
  return Date.now() - time < 7 * 24 * 60 * 60 * 1000
}

function clampSidebarWidth(nextWidth: number): number {
  return Math.min(maxSidebarWidth, Math.max(minSidebarWidth, nextWidth))
}

function updateDragState(isActive: boolean) {
  isResizingSidebar.value = isActive
  document.body.style.cursor = isActive ? 'col-resize' : ''
  document.body.style.userSelect = isActive ? 'none' : ''
}

function stopSidebarResize(pointerId?: number) {
  if (pointerId !== undefined && activePointerId.value !== pointerId) {
    return
  }

  activePointerId.value = null
  updateDragState(false)
}

function handleSidebarResize(event: PointerEvent) {
  if (!isResizingSidebar.value || sidebarCollapsed.value) {
    return
  }

  sidebarWidth.value = clampSidebarWidth(event.clientX)
}

function handleSidebarResizeEnd(event: PointerEvent) {
  stopSidebarResize(event.pointerId)
}

function startSidebarResize(event: PointerEvent) {
  if (sidebarCollapsed.value) {
    return
  }

  activePointerId.value = event.pointerId
  updateDragState(true)
  event.preventDefault()
}

function prefetchTicket(ticketKey: string) {
  if (isLocalTicketKey(ticketKey)) {
    void queryClient.prefetchQuery({
      queryKey: localTicketQueryKey(ticketKey),
      queryFn: () => fetchLocalTicket(ticketKey),
    })
    return
  }

  void queryClient.prefetchQuery({
    queryKey: ticketQueryKey(ticketKey),
    queryFn: () => fetchTicket(ticketKey),
  })
}

function openTicket(ticketKey: string) {
  focusedIssueKey.value = ticketKey
  if (selectedKey.value === ticketKey) return
  selectedKey.value = ticketKey
}

function closeTicket() {
  if (selectedKey.value === null) return
  selectedKey.value = null
}

function focusIssue(ticketKey: string) {
  focusedIssueKey.value = ticketKey
}

function toggleCheckedIssue(ticketKey: string) {
  checkedIssueKeys.value = checkedIssueKeySet.value.has(ticketKey)
    ? checkedIssueKeys.value.filter(key => key !== ticketKey)
    : [...checkedIssueKeys.value, ticketKey]
  selectionAnchorKey.value = ticketKey
}

function clearCheckedIssues() {
  checkedIssueKeys.value = []
  selectionAnchorKey.value = null
}

function getVisibleTicketRangeKeys(anchorKey: string, targetKey: string): string[] {
  const flatTickets = getFlatVisibleTickets()
  const anchorIndex = flatTickets.findIndex(ticket => ticket.key === anchorKey)
  const targetIndex = flatTickets.findIndex(ticket => ticket.key === targetKey)
  if (anchorIndex === -1 || targetIndex === -1) return targetKey ? [targetKey] : []

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return flatTickets.slice(start, end + 1).map(ticket => ticket.key)
}

function addCheckedIssueRange(anchorKey: string, targetKey: string) {
  const nextKeys = getVisibleTicketRangeKeys(anchorKey, targetKey)
  const merged = new Set(checkedIssueKeys.value)
  for (const key of nextKeys) {
    merged.add(key)
  }
  checkedIssueKeys.value = [...merged]
}

function openFirstCheckedIssue() {
  const firstIssue = checkedIssues.value[0]
  if (!firstIssue) return
  openTicket(firstIssue.key)
}

function selectInboxItem(ticketKey: string) {
  activeInboxKey.value = ticketKey
  focusedIssueKey.value = ticketKey
  prefetchTicket(ticketKey)
}

function setInboxReadState(ticketKey: string, isRead: boolean) {
  const keySet = new Set(inboxReadKeys.value)
  if (isRead) {
    keySet.add(ticketKey)
  } else {
    keySet.delete(ticketKey)
  }
  inboxReadKeys.value = [...keySet]
}

function markActiveInboxRead() {
  const item = activeInboxItem.value
  if (!item) return
  setInboxReadState(item.ticket.key, true)
}

function toggleActiveInboxRead() {
  const item = activeInboxItem.value
  if (!item) return
  setInboxReadState(item.ticket.key, item.unread)
}

function markAllInboxRead() {
  const keySet = new Set(inboxReadKeys.value)
  for (const item of inboxItems.value) {
    keySet.add(item.ticket.key)
  }
  inboxReadKeys.value = [...keySet]
}

function archiveInboxItem(ticketKey: string) {
  const currentIndex = inboxItems.value.findIndex(inboxItem => inboxItem.ticket.key === ticketKey)
  if (currentIndex === -1) return
  const nextItem = inboxItems.value[currentIndex + 1] ?? inboxItems.value[currentIndex - 1] ?? null
  const archivedKeySet = new Set(inboxArchivedKeys.value)
  archivedKeySet.add(ticketKey)
  inboxArchivedKeys.value = [...archivedKeySet]
  if (!activeInboxKey.value || activeInboxKey.value === ticketKey) {
    activeInboxKey.value = nextItem?.ticket.key ?? null
  }
  if (activeInboxKey.value === nextItem?.ticket.key) {
    prefetchTicket(nextItem.ticket.key)
  }
}

function archiveActiveInboxItem() {
  const item = activeInboxItem.value
  if (!item) return
  archiveInboxItem(item.ticket.key)
}

function restoreArchivedInboxItems() {
  inboxArchivedKeys.value = []
}

function openActiveInboxIssue() {
  const item = activeInboxItem.value
  if (!item) return
  markActiveInboxRead()
  openTicket(item.ticket.key)
}

function selectRelativeInboxItem(direction: 1 | -1) {
  const items = inboxItems.value
  if (!items.length) return
  const activeKey = activeInboxItem.value?.ticket.key ?? activeInboxKey.value
  const currentIndex = activeKey ? items.findIndex(item => item.ticket.key === activeKey) : -1
  const fallbackIndex = direction > 0 ? 0 : items.length - 1
  const nextIndex = currentIndex === -1
    ? fallbackIndex
    : Math.min(items.length - 1, Math.max(0, currentIndex + direction))
  selectInboxItem(items[nextIndex].ticket.key)
}

async function copyCheckedIssueKeys() {
  const text = checkedIssueKeys.value.join(', ')
  if (!text || !navigator.clipboard) return
  await navigator.clipboard.writeText(text)
}

async function copyIssueKey(ticketKey: string) {
  if (!ticketKey || !navigator.clipboard) return
  await navigator.clipboard.writeText(ticketKey)
}

function openSettings() {
  void navigateTo('/settings')
}

function handleViewChange(viewId: string) {
  if (viewId === 'command') {
    openCommandMenu()
    return
  }

  if (viewId === 'create') {
    openGlobalCreate()
    return
  }

  currentView.value = viewId
  focusedIssueKey.value = null
  clearCheckedIssues()
  closeTicket()

  if (viewId === 'search') {
    searchResultTab.value = 'all'
    nextTick(() => {
      searchInputRef.value?.focus()
    })
  }
}

function openGlobalCreate(issueType = 'Task') {
  createIssueType.value = issueType
  createParentKey.value = null
  issueTypeLocked.value = false
  parentLocked.value = false
  isCreateModalOpen.value = true
}

function openChildCreate(parentKey: string) {
  createIssueType.value = ''
  createParentKey.value = parentKey
  issueTypeLocked.value = false
  parentLocked.value = true
  isCreateModalOpen.value = true
}

function closeCreateModal() {
  isCreateModalOpen.value = false
}

function handleTicketCreated(ticketKey: string, keepOpen = false) {
  if (keepOpen) {
    prefetchTicket(ticketKey)
    return
  }

  isCreateModalOpen.value = false
  openTicket(ticketKey)
}

function openCommandMenu(initialQuery = '') {
  commandQuery.value = initialQuery
  commandActiveIndex.value = 0
  commandMenuOpen.value = true
  displayOptionsOpen.value = false
}

function closeCommandMenu() {
  commandMenuOpen.value = false
  commandQuery.value = ''
  commandActiveIndex.value = 0
}

function closeDisplayOptions() {
  displayOptionsOpen.value = false
}

function toggleDisplayOptions() {
  displayOptionsOpen.value = !displayOptionsOpen.value
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!displayOptionsOpen.value) return
  const target = event.target
  if (!(target instanceof Node)) return

  if (
    displayOptionsPanelRef.value?.contains(target)
    || displayOptionsButtonRef.value?.contains(target)
  ) {
    return
  }

  closeDisplayOptions()
}

function runCommandItem(item: CommandMenuItem) {
  closeCommandMenu()
  item.execute()
}

function runActiveCommand() {
  const item = commandItems.value[commandActiveIndex.value]
  if (!item) return
  runCommandItem(item)
}

function moveCommandSelection(delta: number) {
  const itemCount = commandItems.value.length
  if (itemCount === 0) return
  commandActiveIndex.value = (commandActiveIndex.value + delta + itemCount) % itemCount
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function getIssueSectionCollapseId(section: IssueSection): string {
  return `${currentView.value}:${listGrouping.value}:${section.id}`
}

function isIssueSectionCollapsed(section: IssueSection): boolean {
  return collapsedIssueSectionIds.value.includes(getIssueSectionCollapseId(section))
}

function toggleIssueSection(section: IssueSection) {
  const sectionId = getIssueSectionCollapseId(section)
  collapsedIssueSectionIds.value = isIssueSectionCollapsed(section)
    ? collapsedIssueSectionIds.value.filter(id => id !== sectionId)
    : [...collapsedIssueSectionIds.value, sectionId]
}

function getExpandedSectionTickets(section: IssueSection): JiraTicket[] {
  return isIssueSectionCollapsed(section) ? [] : section.tickets
}

function getFlatVisibleTickets(): JiraTicket[] {
  return issueSections.value.flatMap(getExpandedSectionTickets)
}

function openRelativeVisibleTicket(delta: number, extendSelection = false) {
  const flatTickets = getFlatVisibleTickets()
  if (!flatTickets.length) return

  const currentKey = selectedKey.value || focusedIssueKey.value
  const currentIndex = currentKey
    ? flatTickets.findIndex(ticket => ticket.key === currentKey)
    : -1
  const nextIndex = currentIndex === -1
    ? (delta > 0 ? 0 : flatTickets.length - 1)
    : Math.min(flatTickets.length - 1, Math.max(0, currentIndex + delta))
  const nextTicket = flatTickets[nextIndex]
  if (!nextTicket) return

  if (selectedKey.value) {
    openTicket(nextTicket.key)
    return
  }

  if (extendSelection) {
    const anchorKey = selectionAnchorKey.value ?? focusedIssueKey.value ?? currentKey ?? nextTicket.key
    selectionAnchorKey.value = anchorKey
    addCheckedIssueRange(anchorKey, nextTicket.key)
  }

  focusedIssueKey.value = nextTicket.key
}

function handleCommandMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveCommandSelection(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveCommandSelection(-1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    runActiveCommand()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeCommandMenu()
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openCommandMenu()
    return
  }

  if (displayOptionsOpen.value && event.key === 'Escape') {
    event.preventDefault()
    closeDisplayOptions()
    return
  }

  if (commandMenuOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeCommandMenu()
    }
    return
  }

  if (isCreateModalOpen.value || isEditableTarget(event.target)) {
    return
  }

  const key = event.key.toLowerCase()

  if (selectedKey.value) {
    if (key === 'escape') {
      event.preventDefault()
      closeTicket()
    }
    return
  }

  if (pendingGotoKey.value) {
    pendingGotoKey.value = false
    if (key === 's') {
      event.preventDefault()
      openSettings()
    }
    return
  }

  if (key === 'g') {
    pendingGotoKey.value = true
    window.setTimeout(() => {
      pendingGotoKey.value = false
    }, 1200)
    return
  }

  if (key === '/') {
    event.preventDefault()
    handleViewChange('search')
    return
  }

  if (key === 'c') {
    event.preventDefault()
    openGlobalCreate()
    return
  }

  if (currentView.value === 'inbox') {
    if (key === 'j') {
      event.preventDefault()
      selectRelativeInboxItem(1)
      return
    }

    if (key === 'k') {
      event.preventDefault()
      selectRelativeInboxItem(-1)
      return
    }

    if (key === 'enter') {
      event.preventDefault()
      openActiveInboxIssue()
      return
    }

    if (key === 'e') {
      event.preventDefault()
      archiveActiveInboxItem()
      return
    }

    if (key === 'u') {
      event.preventDefault()
      toggleActiveInboxRead()
      return
    }
  }

  if (key === 'x') {
    const firstVisibleTicket = getFlatVisibleTickets()[0]
    const keyToToggle = selectedKey.value || focusedIssueKey.value || firstVisibleTicket?.key
    if (!keyToToggle) return
    event.preventDefault()
    if (event.shiftKey) {
      const anchorKey = selectionAnchorKey.value ?? keyToToggle
      selectionAnchorKey.value = anchorKey
      addCheckedIssueRange(anchorKey, keyToToggle)
    } else {
      toggleCheckedIssue(keyToToggle)
    }
    return
  }

  if (key === 'j' || key === 'arrowdown') {
    event.preventDefault()
    openRelativeVisibleTicket(1, event.shiftKey)
    return
  }

  if (key === 'k' || key === 'arrowup') {
    event.preventDefault()
    openRelativeVisibleTicket(-1, event.shiftKey)
    return
  }

  if (key === 'enter' && !selectedKey.value) {
    const firstVisibleTicket = getFlatVisibleTickets()[0]
    const keyToOpen = focusedIssueKey.value ?? firstVisibleTicket?.key
    if (!keyToOpen) return
    event.preventDefault()
    openTicket(keyToOpen)
    return
  }

  if (key === 'escape' && checkedIssueCount.value > 0) {
    event.preventDefault()
    clearCheckedIssues()
  }
}

async function handleRefresh() {
  await refresh()
  if (selectedKey.value) {
    queryClient.invalidateQueries({
      queryKey: ticketQueryKey(selectedKey.value),
    })
  }
}

watch(sidebarCollapsed, isCollapsed => {
  if (isCollapsed) {
    stopSidebarResize()
  }
})

onMounted(() => {
  window.addEventListener('pointermove', handleSidebarResize)
  window.addEventListener('pointerup', handleSidebarResizeEnd)
  window.addEventListener('pointercancel', handleSidebarResizeEnd)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  document.addEventListener('keydown', handleGlobalKeydown, true)
})

onBeforeUnmount(() => {
  stopSidebarResize()
  window.removeEventListener('pointermove', handleSidebarResize)
  window.removeEventListener('pointerup', handleSidebarResizeEnd)
  window.removeEventListener('pointercancel', handleSidebarResizeEnd)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  document.removeEventListener('keydown', handleGlobalKeydown, true)
})
</script>

<template>
  <div class="linear-shell flex h-screen overflow-hidden" :aria-busy="showInitialWorkspaceOverlay">
    <div
      class="relative shrink-0 transition-[width] duration-200"
      :style="{ width: `${effectiveSidebarWidth}px` }"
    >
      <Sidebar
        :tickets="tickets"
        :selected-key="selectedKey"
        :collapsed="sidebarCollapsed"
        :refreshing="refreshing"
        :current-view="currentView"
        @select="openTicket"
        @prefetch="prefetchTicket"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        @refresh="handleRefresh"
        @home="handleViewChange('my-issues')"
        @settings="openSettings"
        @command="openCommandMenu"
        @view="handleViewChange"
      />

      <button
        v-if="!sidebarCollapsed"
        type="button"
        class="absolute top-0 right-0 z-10 h-full w-2 -mr-1 cursor-col-resize touch-none bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-white/[0.06] hover:after:bg-white/[0.16] focus:outline-none"
        :class="isResizingSidebar ? 'after:bg-white/[0.22]' : ''"
        aria-label="Resize sidebar"
        @pointerdown="startSidebarResize"
      />
    </div>

    <main class="min-w-0 flex-1 overflow-hidden p-2">
      <div class="linear-panel flex h-full min-w-0 flex-col overflow-hidden rounded-lg bg-[#0d0e10]">
        <header
          v-if="!selectedTicket"
          class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-4"
        >
          <div class="min-w-0">
            <div class="flex min-w-0 items-baseline gap-2">
              <h1 class="truncate text-[20px] font-semibold text-[#f0f1f4]">{{ viewTitle }}</h1>
              <span v-if="currentView === 'projects' || currentTeamSection === 'projects'" class="shrink-0 text-[12px] text-[#777a83]">
                {{ displayedProjectRows.length }} {{ displayedProjectRows.length === 1 ? 'project' : 'projects' }}
              </span>
              <span v-else-if="currentView === 'initiatives'" class="shrink-0 text-[12px] text-[#777a83]">
                {{ initiativeRows.length }} {{ initiativeRows.length === 1 ? 'initiative' : 'initiatives' }}
              </span>
              <span v-else-if="isViewsDirectory || currentTeamSection === 'views'" class="shrink-0 text-[12px] text-[#777a83]">
                {{ displayedSavedViewRows.length }} {{ displayedSavedViewRows.length === 1 ? 'view' : 'views' }}
              </span>
              <span v-else-if="currentView === 'inbox'" class="shrink-0 text-[12px] text-[#777a83]">
                {{ inboxItems.length }} {{ inboxItems.length === 1 ? 'notification' : 'notifications' }}
              </span>
              <span v-else-if="currentView !== 'search'" class="shrink-0 text-[12px] text-[#777a83]">
                {{ visibleIssueCount }} {{ visibleIssueCount === 1 ? 'issue' : 'issues' }}
              </span>
            </div>
          </div>

          <div class="relative flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              class="flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 text-[12px] text-[#bfc1c8] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              @click="openGlobalCreate()"
            >
              <span>＋</span>
              <span>New</span>
            </button>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.035] text-[#8f9198] hover:bg-white/[0.06] hover:text-[#f0f1f4] disabled:opacity-50"
              :disabled="refreshing"
              title="Refresh"
              @click="handleRefresh"
            >
              <span :class="{ 'animate-spin': refreshing }">↻</span>
            </button>
            <button
              v-if="!selectedTicket"
              ref="displayOptionsButtonRef"
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.035] text-[#8f9198] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              title="Display options"
              @click="toggleDisplayOptions"
            >
              ⇄
            </button>

            <div
              v-if="displayOptionsOpen && !selectedTicket"
              ref="displayOptionsPanelRef"
              class="absolute right-0 top-10 z-20 w-[22rem] overflow-hidden rounded-lg border border-white/[0.08] bg-surface-2 shadow-xl shadow-black/35"
            >
              <div class="flex h-10 items-center justify-between gap-3 border-b border-white/[0.06] px-3">
                <p class="text-[12px] font-medium text-[#d7d8dc]">Display</p>
                <button
                  type="button"
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-[#777a83] transition hover:bg-white/[0.05] hover:text-[#f0f1f4]"
                  aria-label="Close display options"
                  @click="closeDisplayOptions"
                >
                  <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                    <path stroke-linecap="round" d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />
                  </svg>
                </button>
              </div>

              <div class="space-y-0.5 p-2">
                <div class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5">
                  <span class="text-[12px] text-[#8f9198]">Layout</span>
                  <div class="grid grid-cols-2 gap-1 rounded-md bg-black/20 p-0.5">
                    <button type="button" class="rounded bg-white/[0.08] px-2 py-1 text-[12px] text-[#f0f1f4]">List</button>
                    <button type="button" class="rounded px-2 py-1 text-[12px] text-[#777a83]" disabled>Board</button>
                  </div>
                </div>

                <label class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.025]">
                  <span class="text-[12px] text-[#8f9198]">Group by</span>
                  <select v-model="listGrouping" name="issue-grouping" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                    <option value="status">Status</option>
                    <option value="priority">Priority</option>
                    <option value="none">None</option>
                  </select>
                </label>

                <label class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.025]">
                  <span class="text-[12px] text-[#8f9198]">Order by</span>
                  <select v-model="listOrdering" name="issue-ordering" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                    <option value="priority">Priority</option>
                    <option value="updated">Last updated</option>
                    <option value="created">Created</option>
                    <option value="key">Issue key</option>
                  </select>
                </label>

                <label class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.025]">
                  <span class="text-[12px] text-[#8f9198]">Completed</span>
                  <select v-model="completedRange" name="completed-range" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                    <option value="hidden">Hidden</option>
                    <option value="week">Past week</option>
                    <option value="month">Past month</option>
                    <option value="all">All</option>
                  </select>
                </label>
              </div>

              <div class="border-t border-white/[0.06] p-2">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left transition hover:bg-white/[0.025]"
                  role="switch"
                  :aria-checked="showSubIssueContext"
                  @click="showSubIssueContext = !showSubIssueContext"
                >
                  <span class="text-[12px] text-[#bfc1c8]">Sub-issue context</span>
                  <span
                    class="flex h-4 w-7 items-center rounded-full border p-0.5 transition"
                    :class="showSubIssueContext ? 'border-white/[0.14] bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'"
                  >
                    <span
                      class="h-2.5 w-2.5 rounded-full bg-[#f0f1f4] transition"
                      :class="showSubIssueContext ? 'translate-x-3' : 'translate-x-0'"
                    ></span>
                  </span>
                </button>
              </div>

              <div class="border-t border-white/[0.06] p-3">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <span class="text-[12px] text-[#8f9198]">Visible properties</span>
                  <span class="text-[11px] text-[#6f727b]">{{ visibleIssueRowFields.length }} shown</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="field in issueRowFieldOptions"
                    :key="field.id"
                    type="button"
                    class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition"
                    :class="isIssueRowFieldVisible(field.id)
                      ? 'border-white/[0.12] bg-white/[0.06] text-[#f0f1f4]'
                      : 'border-white/[0.06] bg-white/[0.025] text-[#8f9198] hover:bg-white/[0.04] hover:text-[#d7d8dc]'"
                    :disabled="visibleIssueRowFields.length === 1 && isIssueRowFieldVisible(field.id)"
                    @click="toggleIssueRowField(field.id)"
                  >
                    <span
                      class="flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]"
                      :class="isIssueRowFieldVisible(field.id) ? 'border-white/[0.18] text-slate-200' : 'border-white/[0.1] text-transparent'"
                    >
                      ✓
                    </span>
                    <span>{{ field.label }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div v-if="!selectedTicket && viewTabs.length" class="flex h-10 shrink-0 items-center gap-1 border-b border-white/[0.06] px-3">
          <button
            v-for="tab in viewTabs"
            :key="tab.id"
            type="button"
            class="rounded-full px-3 py-1.5 text-[12px] transition"
            :class="currentView === tab.id ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
            @click="handleViewChange(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div v-if="selectedKey" class="min-h-0 flex-1 overflow-y-auto">
          <TicketDetail
            :ticket-key="selectedKey"
            mode="inline"
            @close="closeTicket"
            @select="openTicket"
            @navigate-view="handleViewChange"
            @create-child="openChildCreate"
          />
        </div>

        <div v-else-if="currentView === 'search'" class="min-h-0 flex-1 overflow-hidden">
          <div class="shrink-0 border-b border-white/[0.06] px-4 py-3">
            <div class="flex max-w-3xl items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-2">
              <span class="text-[12px] text-[#777a83]">Search</span>
              <input
                ref="searchInputRef"
                v-model="issueSearch"
                type="search"
                class="min-w-0 flex-1 bg-transparent text-[13px] text-[#e6e7ea] outline-none placeholder:text-[#6f727b]"
                placeholder="Search issues, projects, initiatives..."
              >
              <button
                v-if="issueSearch"
                type="button"
                class="rounded px-1.5 py-0.5 text-[11px] text-[#777a83] hover:bg-white/[0.06] hover:text-[#d7d8dc]"
                @click="issueSearch = ''"
              >
                Clear
              </button>
            </div>

            <div class="mt-3 flex items-center gap-1">
              <button
                v-for="tab in searchTabs"
                :key="tab.id"
                type="button"
                class="rounded-full px-3 py-1.5 text-[12px] transition"
                :class="searchResultTab === tab.id ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="searchResultTab = tab.id"
              >
                {{ tab.label }}
                <span class="ml-1 text-[#6f727b]">{{ tab.count }}</span>
              </button>
            </div>
          </div>

          <div class="h-full overflow-y-auto pb-16">
            <template v-if="searchResultTab === 'all'">
              <section v-if="searchedTickets.length" class="border-b border-white/[0.06]">
                <div class="flex h-8 items-center gap-2 bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]">
                  <span>Issues</span>
                  <span class="text-[#6f727b]">{{ searchedTickets.length }}</span>
                </div>
                <IssueRow
                  v-for="ticket in searchedTickets.slice(0, 12)"
                  :key="ticket.key"
                  :ticket="showSubIssueContext ? ticket : { ...ticket, parent: undefined }"
                  :selected="focusedIssueKey === ticket.key"
                  :checked="checkedIssueKeySet.has(ticket.key)"
                  v-bind="issueRowDisplayProps"
                  @select="openTicket"
                  @prefetch="prefetchTicket"
                  @toggle-check="toggleCheckedIssue"
                  @copy-key="copyIssueKey"
                  @create-child="openChildCreate"
                />
              </section>

              <section v-if="searchedProjectRows.length" class="border-b border-white/[0.06]">
                <div class="flex h-8 items-center gap-2 bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]">
                  <span>Projects</span>
                  <span class="text-[#6f727b]">{{ searchedProjectRows.length }}</span>
                </div>
                <button
                  v-for="project in searchedProjectRows.slice(0, 8)"
                  :key="project.key"
                  type="button"
                  class="linear-row grid min-h-12 w-full grid-cols-[minmax(220px,1fr)_108px_120px_132px] items-center px-4 py-2 text-left"
                  @mouseenter="prefetchTicket(project.key)"
                  @click="openTicket(project.key)"
                >
                  <span class="min-w-0 pr-4">
                    <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ project.name }}</span>
                    <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ project.key }} · {{ project.spaceName }}</span>
                  </span>
                  <span>
                    <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="getProjectHealthClass(project.health)">
                      {{ project.health }}
                    </span>
                  </span>
                  <span class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ project.lead }}</span>
                  <span class="text-[12px] text-[#8f9198]">{{ project.progress }}% complete</span>
                </button>
              </section>

              <section v-if="searchedInitiativeRows.length" class="border-b border-white/[0.06]">
                <div class="flex h-8 items-center gap-2 bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]">
                  <span>Initiatives</span>
                  <span class="text-[#6f727b]">{{ searchedInitiativeRows.length }}</span>
                </div>
                <button
                  v-for="initiative in searchedInitiativeRows"
                  :key="initiative.id"
                  type="button"
                  class="linear-row grid min-h-12 w-full grid-cols-[minmax(220px,1fr)_108px_120px_132px] items-center px-4 py-2 text-left"
                  @click="handleViewChange('initiatives')"
                >
                  <span class="min-w-0 pr-4">
                    <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ initiative.name }}</span>
                    <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ initiative.description }}</span>
                  </span>
                  <span>
                    <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="getProjectHealthClass(initiative.health)">
                      {{ initiative.health }}
                    </span>
                  </span>
                  <span class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ initiative.lead }}</span>
                  <span class="text-[12px] text-[#8f9198]">{{ initiative.projectCount }} projects</span>
                </button>
              </section>

              <div v-if="searchTabs[0]?.count === 0" class="flex min-h-80 items-center justify-center px-6 text-center">
                <div class="max-w-sm">
                  <p class="text-[13px] font-medium text-[#d7d8dc]">No results found</p>
                  <p class="mt-1 text-[12px] text-[#777a83]">Try a different issue key, title, owner, status, or team.</p>
                </div>
              </div>
            </template>

            <template v-else-if="searchResultTab === 'issues'">
              <div v-if="searchedTickets.length">
                <IssueRow
                  v-for="ticket in searchedTickets"
                  :key="ticket.key"
                  :ticket="showSubIssueContext ? ticket : { ...ticket, parent: undefined }"
                  :selected="focusedIssueKey === ticket.key"
                  :checked="checkedIssueKeySet.has(ticket.key)"
                  v-bind="issueRowDisplayProps"
                  @select="openTicket"
                  @prefetch="prefetchTicket"
                  @toggle-check="toggleCheckedIssue"
                  @copy-key="copyIssueKey"
                  @create-child="openChildCreate"
                />
              </div>
            </template>

            <template v-else-if="searchResultTab === 'projects'">
              <div v-if="searchedProjectRows.length">
                <button
                  v-for="project in searchedProjectRows"
                  :key="project.key"
                  type="button"
                  class="linear-row grid min-h-12 w-full grid-cols-[minmax(220px,1fr)_108px_120px_132px] items-center px-4 py-2 text-left"
                  @mouseenter="prefetchTicket(project.key)"
                  @click="openTicket(project.key)"
                >
                  <span class="min-w-0 pr-4">
                    <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ project.name }}</span>
                    <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ project.key }} · {{ project.spaceName }}</span>
                  </span>
                  <span>
                    <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="getProjectHealthClass(project.health)">
                      {{ project.health }}
                    </span>
                  </span>
                  <span class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ project.lead }}</span>
                  <span class="text-[12px] text-[#8f9198]">{{ project.progress }}% complete</span>
                </button>
              </div>
            </template>

            <template v-else-if="searchResultTab === 'initiatives'">
              <div v-if="searchedInitiativeRows.length">
                <button
                  v-for="initiative in searchedInitiativeRows"
                  :key="initiative.id"
                  type="button"
                  class="linear-row grid min-h-12 w-full grid-cols-[minmax(220px,1fr)_108px_120px_132px] items-center px-4 py-2 text-left"
                  @click="handleViewChange('initiatives')"
                >
                  <span class="min-w-0 pr-4">
                    <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ initiative.name }}</span>
                    <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ initiative.description }}</span>
                  </span>
                  <span>
                    <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="getProjectHealthClass(initiative.health)">
                      {{ initiative.health }}
                    </span>
                  </span>
                  <span class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ initiative.lead }}</span>
                  <span class="text-[12px] text-[#8f9198]">{{ initiative.projectCount }} projects</span>
                </button>
              </div>
            </template>

            <div
              v-if="searchResultTab === 'documents' || (searchResultTab !== 'all' && searchTabs.find(tab => tab.id === searchResultTab)?.count === 0)"
              class="flex min-h-80 items-center justify-center px-6 text-center"
            >
              <div class="max-w-sm">
                <p class="text-[13px] font-medium text-[#d7d8dc]">{{ searchResultTab === 'documents' ? 'No searchable documents' : 'No results found' }}</p>
                <p class="mt-1 text-[12px] text-[#777a83]">{{ searchResultTab === 'documents' ? 'Document search will appear when workspace documents are connected.' : 'Try a different issue key, title, owner, status, or team.' }}</p>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'inbox'" class="grid min-h-0 flex-1 grid-cols-[minmax(280px,400px)_minmax(0,1fr)] overflow-hidden">
          <div class="min-w-0 border-r border-white/[0.06]">
            <div class="flex h-9 items-center justify-between gap-2 border-b border-white/[0.06] px-3 text-[12px] text-[#777a83]">
              <span>
                {{ inboxItems.length }} {{ inboxItems.length === 1 ? 'notification' : 'notifications' }}
                <span v-if="inboxUnreadCount > 0" class="text-[#aeb0b7]">· {{ inboxUnreadCount }} unread</span>
              </span>
              <div class="flex items-center gap-1">
                <button
                  v-if="inboxUnreadCount > 0"
                  type="button"
                  class="rounded px-1.5 py-1 hover:bg-white/[0.05] hover:text-[#d7d8dc]"
                  @click="markAllInboxRead"
                >
                  Mark all read
                </button>
                <button
                  v-if="inboxArchivedCount > 0"
                  type="button"
                  class="rounded px-1.5 py-1 hover:bg-white/[0.05] hover:text-[#d7d8dc]"
                  @click="restoreArchivedInboxItems"
                >
                  Restore
                </button>
                <button type="button" class="rounded px-1.5 py-1 hover:bg-white/[0.05] hover:text-[#d7d8dc]" @click="handleRefresh">
                  Refresh
                </button>
              </div>
            </div>

            <div v-if="inboxItems.length" class="h-full overflow-y-auto pb-9">
              <div
                v-for="item in inboxItems"
                :key="item.ticket.key"
                role="button"
                tabindex="0"
                class="group grid w-full grid-cols-[30px_minmax(0,1fr)_auto_auto] gap-3 border-b border-white/[0.045] px-3 py-3 text-left transition hover:bg-white/[0.035]"
                :class="activeInboxItem?.ticket.key === item.ticket.key ? 'bg-white/[0.055]' : ''"
                @mouseenter="prefetchTicket(item.ticket.key)"
                @click="selectInboxItem(item.ticket.key)"
                @keydown.enter.prevent="selectInboxItem(item.ticket.key)"
                @keydown.space.prevent="selectInboxItem(item.ticket.key)"
              >
                <span class="relative flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.045] text-[10px] font-semibold text-[#c8cad0]">
                  {{ item.actorInitials }}
                  <span v-if="item.unread" class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#6f73ff]"></span>
                </span>

                <span class="min-w-0">
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-[13px] font-medium text-[#e6e7ea]">{{ item.summary }}</span>
                  </span>
                  <span class="mt-1 block truncate text-[12px] text-[#8f9198]">{{ item.excerpt }}</span>
                  <span class="mt-1.5 flex items-center gap-2 text-[11px] text-[#6f727b]">
                    <span>{{ item.actorName }}</span>
                    <span>·</span>
                    <span>{{ item.ticket.spaceKey }}</span>
                  </span>
                </span>

                <span class="whitespace-nowrap pt-0.5 text-[11px] text-[#6f727b]">{{ item.relativeTime }}</span>
                <span class="flex items-start pt-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[11px] text-[#8f9198] hover:bg-white/[0.06] hover:text-[#d7d8dc]"
                    title="Archive"
                    @click.stop="archiveInboxItem(item.ticket.key)"
                  >
                    E
                  </button>
                </span>
              </div>
            </div>

            <div v-else class="flex h-full min-h-80 items-center justify-center px-8 text-center">
              <div class="max-w-sm">
                <p class="text-[13px] font-medium text-[#d7d8dc]">Inbox is clear</p>
                <p class="mt-1 text-[12px] text-[#777a83]">New triage issues will appear here.</p>
              </div>
            </div>
          </div>

          <div class="min-w-0 overflow-y-auto">
            <div v-if="activeInboxItem" class="mx-auto max-w-3xl px-8 py-10">
              <div class="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 text-[12px] text-[#777a83]">
                    <span>{{ activeInboxItem.ticket.spaceName }}</span>
                    <span>·</span>
                    <span>{{ activeInboxItem.ticket.key }}</span>
                    <span>·</span>
                    <span>{{ activeInboxItem.relativeTime }}</span>
                  </div>
                  <h2 class="mt-2 text-[20px] font-semibold leading-snug text-[#f0f1f4]">{{ activeInboxItem.ticket.summary }}</h2>
                </div>

                <button
                  type="button"
                  class="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-[12px] text-[#d7d8dc] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
                  @click="openActiveInboxIssue"
                >
                  Open issue
                </button>
              </div>

              <div class="flex flex-wrap items-center gap-2 border-b border-white/[0.06] py-3">
                <button
                  type="button"
                  class="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[12px] text-[#aeb0b7] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
                  @click="toggleActiveInboxRead"
                >
                  {{ activeInboxItem.unread ? 'Mark read' : 'Mark unread' }}
                </button>
                <button
                  type="button"
                  class="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[12px] text-[#aeb0b7] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
                  @click="archiveActiveInboxItem"
                >
                  Archive
                </button>
              </div>

              <div class="grid gap-3 border-b border-white/[0.06] py-5 text-[13px]">
                <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
                  <span class="text-[#777a83]">Status</span>
                  <span class="text-[#d7d8dc]">{{ activeInboxItem.ticket.status }}</span>
                </div>
                <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
                  <span class="text-[#777a83]">Priority</span>
                  <span class="text-[#d7d8dc]">{{ activeInboxItem.ticket.priority || 'No priority' }}</span>
                </div>
                <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
                  <span class="text-[#777a83]">Assignee</span>
                  <span class="text-[#d7d8dc]">{{ activeInboxItem.ticket.assignee || 'Unassigned' }}</span>
                </div>
                <div v-if="activeInboxProjectParent" class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
                  <span class="text-[#777a83]">Project</span>
                  <span class="min-w-0 truncate text-[#d7d8dc]">
                    {{ activeInboxProjectParent.summary }}
                  </span>
                </div>
                <div v-else-if="activeInboxIssueParent" class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
                  <span class="text-[#777a83]">Parent</span>
                  <span class="min-w-0 truncate text-[#d7d8dc]">
                    {{ activeInboxIssueParent.key }} · {{ activeInboxIssueParent.summary }}
                  </span>
                </div>
              </div>

              <div class="py-5">
                <h3 class="text-[13px] font-medium text-[#f0f1f4]">{{ activeInboxItem.summary }}</h3>
                <p class="mt-2 text-[13px] leading-6 text-[#aeb0b7]">{{ activeInboxItem.excerpt }}</p>
              </div>
            </div>

            <div v-else class="flex h-full min-h-80 items-center justify-center px-8 text-center">
              <p class="text-[13px] text-[#777a83]">Select a notification to preview it.</p>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'initiatives'" class="min-h-0 flex-1 overflow-y-auto">
          <div class="grid grid-cols-[minmax(260px,1.4fr)_112px_124px_132px_156px_112px] border-b border-white/[0.06] px-4 py-2 text-[12px] text-[#777a83]">
            <span>Name</span>
            <span>Health</span>
            <span>Lead</span>
            <span>Projects</span>
            <span>Issues</span>
            <span>Updated</span>
          </div>

          <div v-if="initiativeRows.length">
            <button
              v-for="initiative in initiativeRows"
              :key="initiative.id"
              type="button"
              class="linear-row grid min-h-12 w-full grid-cols-[minmax(260px,1.4fr)_112px_124px_132px_156px_112px] items-center px-4 py-2 text-left"
              @click="handleViewChange('project-views')"
            >
              <span class="min-w-0 pr-4">
                <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ initiative.name }}</span>
                <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ initiative.description }}</span>
              </span>

              <span>
                <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="getProjectHealthClass(initiative.health)">
                  {{ initiative.health }}
                </span>
              </span>

              <span class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ initiative.lead }}</span>
              <span class="text-[12px] text-[#8f9198]">{{ initiative.projectCount }} {{ initiative.projectCount === 1 ? 'project' : 'projects' }}</span>

              <span class="pr-5">
                <span class="flex items-center justify-between gap-2 text-[11px] text-[#8f9198]">
                  <span>{{ initiative.completedCount }}/{{ initiative.issueCount }}</span>
                  <span>{{ initiative.progress }}%</span>
                </span>
                <span class="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span class="block h-full rounded-full" :class="getProgressBarClass(initiative.health)" :style="{ width: `${initiative.progress}%` }"></span>
                </span>
              </span>

              <span class="truncate text-[12px] text-[#777a83]">{{ getRelativeTimeLabel(initiative.updatedAt) }}</span>
            </button>
          </div>

          <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
            <div class="max-w-sm">
              <p class="text-[13px] font-medium text-[#d7d8dc]">No initiatives found</p>
              <p class="mt-1 text-[12px] text-[#777a83]">Initiatives will appear when projects can be grouped into roadmap work.</p>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'projects' || currentTeamSection === 'projects'" class="min-h-0 flex-1 overflow-y-auto">
          <div class="grid grid-cols-[minmax(220px,1.4fr)_108px_94px_130px_104px_150px_116px] border-b border-white/[0.06] px-4 py-2 text-[12px] text-[#777a83]">
            <span>Name</span>
            <span>Health</span>
            <span>Priority</span>
            <span>Lead</span>
            <span>Target date</span>
            <span>Issues</span>
            <span>Status</span>
          </div>

          <div v-if="displayedProjectRows.length">
            <button
              v-for="project in displayedProjectRows"
              :key="project.key"
              type="button"
              class="linear-row grid min-h-12 w-full grid-cols-[minmax(220px,1.4fr)_108px_94px_130px_104px_150px_116px] items-center gap-0 px-4 py-2 text-left"
              @mouseenter="prefetchTicket(project.key)"
              @click="openTicket(project.key)"
            >
              <span class="min-w-0 pr-4">
                <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ project.name }}</span>
                <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ project.key }} · {{ project.spaceName }}</span>
              </span>

              <span>
                <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="getProjectHealthClass(project.health)">
                  {{ project.health }}
                </span>
              </span>

              <span class="truncate text-[12px] text-[#aeb0b7]">{{ project.priority }}</span>
              <span class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ project.lead }}</span>
              <span class="truncate text-[12px] text-[#8f9198]">{{ project.targetDate }}</span>

              <span class="pr-5">
                <span class="flex items-center justify-between gap-2 text-[11px] text-[#8f9198]">
                  <span>{{ project.completedCount }}/{{ project.issueCount }}</span>
                  <span>{{ project.progress }}%</span>
                </span>
                <span class="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span class="block h-full rounded-full" :class="getProgressBarClass(project.health)" :style="{ width: `${project.progress}%` }"></span>
                </span>
              </span>

              <span class="truncate text-[12px] text-[#aeb0b7]">{{ project.status }}</span>
            </button>
          </div>

          <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
            <div class="max-w-sm">
              <p class="text-[13px] font-medium text-[#d7d8dc]">No projects found</p>
              <p class="mt-1 text-[12px] text-[#777a83]">Projects will appear here when enabled teams have project-level work.</p>
            </div>
          </div>
        </div>

        <div v-else-if="isViewsDirectory || currentTeamSection === 'views'" class="min-h-0 flex-1 overflow-y-auto">
          <div class="grid grid-cols-[minmax(260px,1fr)_112px_88px_132px_112px] border-b border-white/[0.06] px-4 py-2 text-[12px] text-[#777a83]">
            <span>Name</span>
            <span>Type</span>
            <span>Items</span>
            <span>Owner</span>
            <span>Updated</span>
          </div>

          <div v-if="displayedSavedViewRows.length">
            <button
              v-for="row in displayedSavedViewRows"
              :key="row.id"
              type="button"
              class="linear-row grid min-h-12 w-full grid-cols-[minmax(260px,1fr)_112px_88px_132px_112px] items-center px-4 py-2 text-left"
              @click="handleViewChange(row.viewId)"
            >
              <span class="flex min-w-0 items-center gap-3 pr-4">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.035] text-[12px] text-[#bfc1c8]">{{ row.icon }}</span>
                <span class="min-w-0">
                  <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ row.name }}</span>
                  <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ row.description }}</span>
                </span>
              </span>

              <span class="truncate text-[12px] text-[#aeb0b7]">{{ row.category }}</span>
              <span class="text-[12px] text-[#8f9198]">{{ row.count }}</span>
              <span class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ row.owner }}</span>
              <span class="truncate text-[12px] text-[#777a83]">{{ getRelativeTimeLabel(row.updatedAt) }}</span>
            </button>
          </div>

          <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
            <div class="max-w-sm">
              <p class="text-[13px] font-medium text-[#d7d8dc]">No saved views found</p>
              <p class="mt-1 text-[12px] text-[#777a83]">Views derived from enabled Jira spaces will appear here.</p>
            </div>
          </div>
        </div>

        <div v-else-if="isReadyQaView" class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
          <div class="min-w-0 overflow-y-auto">
            <div class="flex h-9 items-center justify-between border-b border-white/[0.06] px-4 text-[12px] text-[#777a83]">
              <span>{{ visibleIssueCount }} {{ visibleIssueCount === 1 ? 'issue' : 'issues' }}</span>
              <button v-if="hiddenCompletedCount > 0 && completedRange !== 'all'" type="button" class="hover:text-[#d7d8dc]" @click="completedRange = 'all'">
                {{ hiddenCompletedCount }} completed hidden by display options
              </button>
            </div>

            <div v-if="issueSections.length && visibleIssueCount > 0">
              <section v-for="section in issueSections" :key="section.id">
                <div class="flex h-8 items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[#d7d8dc]"
                    :aria-expanded="!isIssueSectionCollapsed(section)"
                    @click="toggleIssueSection(section)"
                  >
                    <span class="text-[#777a83] transition-transform" :class="isIssueSectionCollapsed(section) ? '-rotate-90' : ''">⌄</span>
                    <span class="truncate">{{ section.label }}</span>
                    <span class="text-[#6f727b]">{{ section.tickets.length }}</span>
                  </button>
                  <button type="button" class="text-[#777a83] hover:text-[#d7d8dc]" @click="openGlobalCreate()">＋</button>
                </div>
                <template v-if="!isIssueSectionCollapsed(section)">
                  <IssueRow
                    v-for="ticket in section.tickets"
                    :key="ticket.key"
                    :ticket="showSubIssueContext ? ticket : { ...ticket, parent: undefined }"
                    :selected="focusedIssueKey === ticket.key"
                    :checked="checkedIssueKeySet.has(ticket.key)"
                    v-bind="issueRowDisplayProps"
                    @select="openTicket"
                    @prefetch="prefetchTicket"
                    @toggle-check="toggleCheckedIssue"
                    @copy-key="copyIssueKey"
                    @create-child="openChildCreate"
                  />
                </template>
              </section>
            </div>

            <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
              <div class="max-w-sm">
                <p class="text-[13px] font-medium text-[#d7d8dc]">No issues are ready for QA</p>
                <p class="mt-1 text-[12px] text-[#777a83]">Issues matching this saved view will appear here.</p>
              </div>
            </div>
          </div>

          <aside class="min-w-0 overflow-y-auto border-l border-white/[0.06] bg-white/[0.015]">
            <div class="border-b border-white/[0.06] px-4 py-3">
              <div class="flex items-center justify-between">
                <h2 class="text-[13px] font-medium text-[#f0f1f4]">Insights</h2>
                <span class="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-[#777a83]">Count</span>
              </div>
              <p class="mt-1 text-[12px] text-[#777a83]">Live summary for this saved view.</p>
            </div>

            <div class="grid grid-cols-3 border-b border-white/[0.06] text-center">
              <div class="border-r border-white/[0.06] px-2 py-3">
                <p class="text-[18px] font-semibold text-[#f0f1f4]">{{ readyQaInsightTickets.length }}</p>
                <p class="mt-0.5 text-[11px] text-[#777a83]">Issues</p>
              </div>
              <div class="border-r border-white/[0.06] px-2 py-3">
                <p class="text-[18px] font-semibold text-[#f0f1f4]">{{ readyQaUnassignedCount }}</p>
                <p class="mt-0.5 text-[11px] text-[#777a83]">Unassigned</p>
              </div>
              <div class="px-2 py-3">
                <p class="text-[18px] font-semibold text-[#f0f1f4]">{{ readyQaRecentlyUpdatedCount }}</p>
                <p class="mt-0.5 text-[11px] text-[#777a83]">Recent</p>
              </div>
            </div>

            <div class="space-y-5 px-4 py-4">
              <section>
                <div class="mb-2 flex items-center justify-between text-[12px]">
                  <span class="font-medium text-[#d7d8dc]">By priority</span>
                  <span class="text-[#6f727b]">Slice</span>
                </div>
                <div class="space-y-2">
                  <div v-for="(slice, index) in readyQaPrioritySlices" :key="slice.id" class="space-y-1.5">
                    <div class="flex items-center justify-between gap-3 text-[12px]">
                      <span class="truncate text-[#aeb0b7]">{{ slice.label }}</span>
                      <span class="shrink-0 text-[#777a83]">{{ slice.count }}</span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div class="h-full rounded-full" :class="getInsightBarClass(index)" :style="{ width: `${slice.percent}%` }"></div>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div class="mb-2 flex items-center justify-between text-[12px]">
                  <span class="font-medium text-[#d7d8dc]">By assignee</span>
                  <span class="text-[#6f727b]">Top 5</span>
                </div>
                <div class="space-y-2">
                  <div v-for="(slice, index) in readyQaAssigneeSlices" :key="slice.id" class="space-y-1.5">
                    <div class="flex items-center justify-between gap-3 text-[12px]">
                      <span class="truncate text-[#aeb0b7]">{{ slice.label }}</span>
                      <span class="shrink-0 text-[#777a83]">{{ slice.count }}</span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div class="h-full rounded-full" :class="getInsightBarClass(index)" :style="{ width: `${slice.percent}%` }"></div>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div class="mb-2 flex items-center justify-between text-[12px]">
                  <span class="font-medium text-[#d7d8dc]">By status</span>
                  <span class="text-[#6f727b]">Workflow</span>
                </div>
                <div class="space-y-2">
                  <div v-for="(slice, index) in readyQaStatusSlices" :key="slice.id" class="space-y-1.5">
                    <div class="flex items-center justify-between gap-3 text-[12px]">
                      <span class="truncate text-[#aeb0b7]">{{ slice.label }}</span>
                      <span class="shrink-0 text-[#777a83]">{{ slice.count }}</span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div class="h-full rounded-full" :class="getInsightBarClass(index)" :style="{ width: `${slice.percent}%` }"></div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>

        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <div class="flex h-9 items-center justify-between border-b border-white/[0.06] px-4 text-[12px] text-[#777a83]">
            <span>{{ visibleIssueCount }} {{ visibleIssueCount === 1 ? 'issue' : 'issues' }}</span>
            <button v-if="hiddenCompletedCount > 0 && completedRange !== 'all'" type="button" class="hover:text-[#d7d8dc]" @click="completedRange = 'all'">
              {{ hiddenCompletedCount }} completed hidden by display options
            </button>
          </div>

          <div v-if="issueSections.length && visibleIssueCount > 0">
            <section v-for="section in issueSections" :key="section.id">
              <div class="flex h-8 items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[#d7d8dc]"
                  :aria-expanded="!isIssueSectionCollapsed(section)"
                  @click="toggleIssueSection(section)"
                >
                  <span class="text-[#777a83] transition-transform" :class="isIssueSectionCollapsed(section) ? '-rotate-90' : ''">⌄</span>
                  <span class="truncate">{{ section.label }}</span>
                  <span class="text-[#6f727b]">{{ section.tickets.length }}</span>
                </button>
                <button type="button" class="text-[#777a83] hover:text-[#d7d8dc]" @click="openGlobalCreate()">＋</button>
              </div>
              <template v-if="!isIssueSectionCollapsed(section)">
                <IssueRow
                  v-for="ticket in section.tickets"
                  :key="ticket.key"
                  :ticket="showSubIssueContext ? ticket : { ...ticket, parent: undefined }"
                  :selected="focusedIssueKey === ticket.key"
                  :checked="checkedIssueKeySet.has(ticket.key)"
                  v-bind="issueRowDisplayProps"
                  @select="openTicket"
                  @prefetch="prefetchTicket"
                  @toggle-check="toggleCheckedIssue"
                  @copy-key="copyIssueKey"
                  @create-child="openChildCreate"
                />
              </template>
            </section>
          </div>

          <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
            <div class="max-w-sm">
              <p class="text-[13px] font-medium text-[#d7d8dc]">No issues match this view</p>
              <p class="mt-1 text-[12px] text-[#777a83]">Adjust filters or create a new issue.</p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="commandMenuOpen"
          class="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm"
          @click.self="closeCommandMenu"
        >
          <div class="w-full max-w-2xl overflow-hidden rounded-lg border border-white/[0.08] bg-surface-1 shadow-xl shadow-black/45">
            <div class="border-b border-white/[0.06] p-2">
              <div class="flex items-center gap-3 rounded-md border border-white/[0.08] bg-white/[0.035] px-3 py-2">
                <span class="text-[13px] text-slate-500">⌕</span>
                <input
                  ref="commandInputRef"
                  v-model="commandQuery"
                  type="text"
                  class="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                  placeholder="Find an issue or command..."
                  @keydown="handleCommandMenuKeydown"
                >
                <span class="hidden rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">Esc</span>
              </div>
            </div>

            <div class="max-h-[28rem] overflow-y-auto py-2">
              <template v-if="commandItems.length">
                <div
                  v-for="(item, index) in commandItems"
                  :key="item.id"
                >
                  <div
                    v-if="index === 0 || item.section !== commandItems[index - 1]?.section"
                    class="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600"
                  >
                    {{ item.section }}
                  </div>
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 px-3 py-2 text-left transition"
                    :class="commandActiveIndex === index ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]'"
                    @mouseenter="commandActiveIndex = index"
                    @click="runCommandItem(item)"
                  >
                    <span
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[12px]"
                      :class="item.section === 'Issues'
                        ? 'border-white/[0.06] bg-white/[0.025] text-slate-500'
                        : 'border-white/[0.08] bg-white/[0.035] text-slate-400'"
                    >
                      {{ item.icon ?? '>' }}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[13px] font-medium text-slate-200">{{ item.label }}</span>
                      <span class="mt-0.5 block truncate text-[12px] text-slate-500">{{ item.description }}</span>
                    </span>
                  </button>
                </div>
              </template>

              <div v-else class="px-6 py-10 text-center">
                <p class="text-sm font-medium text-slate-300">No results</p>
                <p class="mt-1 text-xs text-slate-600">Try a different issue key, title, assignee, or command.</p>
              </div>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="checkedIssueCount > 0"
          class="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
          aria-live="polite"
        >
          <div class="flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-2/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur">
            <div class="flex items-center gap-2 border-r border-white/[0.08] px-2.5 text-[12px] text-[#d7d8dc]">
              <span class="flex h-5 min-w-5 items-center justify-center rounded border border-white/[0.08] bg-white/[0.045] px-1.5 text-[11px] font-semibold text-slate-200">{{ checkedIssueCount }}</span>
              <span class="whitespace-nowrap">{{ checkedIssueCount === 1 ? 'issue selected' : 'issues selected' }}</span>
            </div>

            <button
              type="button"
              class="h-7 rounded-md px-2.5 text-[12px] text-[#bfc1c8] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              @click="openFirstCheckedIssue"
            >
              Open
            </button>
            <button
              type="button"
              class="h-7 rounded-md px-2.5 text-[12px] text-[#bfc1c8] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              @click="copyCheckedIssueKeys"
            >
              Copy IDs
            </button>
            <button
              v-if="checkedIssueCount === 1 && checkedIssues[0]"
              type="button"
              class="h-7 rounded-md px-2.5 text-[12px] text-[#bfc1c8] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              @click="openChildCreate(checkedIssues[0].key)"
            >
              Add sub-issue
            </button>
            <button
              type="button"
              class="h-7 rounded-md px-2.5 text-[12px] text-[#8f9198] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              @click="clearCheckedIssues"
            >
              Clear
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <CreateTicketModal
      :open="isCreateModalOpen"
      :tickets="tickets"
      :initial-issue-type="createIssueType"
      :initial-parent-key="createParentKey"
      :issue-type-locked="issueTypeLocked"
      :parent-locked="parentLocked"
      @close="closeCreateModal"
      @created="handleTicketCreated"
    />

    <div
      v-if="showInitialWorkspaceOverlay"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8"
      aria-live="polite"
    >
      <div class="linear-panel flex w-full max-w-sm items-center gap-3 rounded-lg bg-[#121316] px-4 py-3 shadow-xl shadow-black/35">
        <div class="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/[0.12] border-t-[#d7d8dc]"></div>
        <div class="min-w-0 text-left">
          <h2 class="text-[13px] font-medium text-[#f0f1f4]">Connecting to Jira</h2>
          <p class="mt-0.5 truncate text-[12px] text-[#8f9198]">Pulling latest issues and workspace settings.</p>
        </div>
      </div>
    </div>
  </div>
</template>
