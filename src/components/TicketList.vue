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
import { useFavoriteViews } from '@/composables/useFavoriteViews'
import { useCustomViews } from '@/composables/useCustomViews'
import { getLinearIssueSubtype, getStatusGroup, type JiraTicket } from '@/types/jira'
import { isLocalTicketKey } from '~/shared/localTickets'
import type { CustomView, CustomViewDisplay, CustomViewFilter, FavoriteViewFilter } from '~/shared/settings'
import AddSpaceModal from './AddSpaceModal.vue'
import CreateTicketModal from './CreateTicketModal.vue'
import IssueRow from './IssueRow.vue'
import Sidebar from './Sidebar.vue'
import TicketDetail from './TicketDetail.vue'
import ViewEditorCard from './ViewEditorCard.vue'

const { tickets, fetching, refreshing, refresh } = useJiraTickets()
const queryClient = useQueryClient()
const route = useRoute()
const {
  enabledSpaces,
  hasJiraCredentialsConfigured,
  isLoading: isLoadingSpaceSettings,
  deleteSpace,
} = useSpaceSettings()
const { favoriteViews, isFavoriteView, getFavoriteView, toggleFavoriteView } = useFavoriteViews()
const { customViews, getCustomView, customViewsForContext, upsertCustomView, removeCustomView } = useCustomViews()
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
const groupOrderingOpen = ref(false)
type IssueGroupingFieldId = 'none' | 'status' | 'assignee' | 'agent' | 'project' | 'priority' | 'label'
type IssueOrderingFieldId = 'manual' | 'title' | 'status' | 'priority' | 'assignee' | 'agent' | 'estimate' | 'updated' | 'created' | 'due' | 'linkCount' | 'timeInStatus'
type ProjectGroupingFieldId = 'none' | 'health' | 'status' | 'priority' | 'lead'
type ProjectOrderingFieldId = 'manual' | 'name' | 'health' | 'priority' | 'lead' | 'targetDate' | 'updated' | 'progress'
type ProjectClosedRange = 'all' | 'hidden'
type IssueVisibilityRange = 'all' | 'day' | 'week' | 'month' | 'hidden'
type IssueGroupConfigMap = Partial<Record<IssueGroupingFieldId, string[]>>

const listGrouping = useLocalStorage<IssueGroupingFieldId>('jira2.linear.grouping', 'none')
const listSubGrouping = useLocalStorage<IssueGroupingFieldId>('jira2.linear.subGrouping', 'none')
const listOrdering = useLocalStorage<IssueOrderingFieldId>('jira2.linear.ordering', 'manual')
const projectGrouping = useLocalStorage<ProjectGroupingFieldId>('jira2.linear.projectGrouping', 'none')
const projectOrdering = useLocalStorage<ProjectOrderingFieldId>('jira2.linear.projectOrdering', 'manual')
const projectClosedRange = useLocalStorage<ProjectClosedRange>('jira2.linear.projectClosedRange', 'all')
const listGroupingDirection = useLocalStorage<'asc' | 'desc'>('jira2.linear.groupingDirection', 'asc')
const listOrderingDirection = useLocalStorage<'asc' | 'desc'>('jira2.linear.orderingDirection', 'asc')
const issueGroupOrders = useLocalStorage<IssueGroupConfigMap>('jira2.linear.issueGroupOrders', {})
const hiddenIssueGroupIds = useLocalStorage<IssueGroupConfigMap>('jira2.linear.hiddenIssueGroupIds', {})
const completedRange = useLocalStorage<IssueVisibilityRange>('jira2.linear.completedRange', 'hidden')
const showSubIssueContext = useLocalStorage('jira2.linear.showSubIssueContext', true)
const showSubIssuesRange = useLocalStorage<IssueVisibilityRange>('jira2.linear.showSubIssuesRange', 'hidden')
const showTriageIssuesRange = useLocalStorage<IssueVisibilityRange>('jira2.linear.showTriageIssuesRange', 'hidden')
const showSubIssues = computed({
  get: () => showSubIssuesRange.value !== 'hidden',
  set: (value: boolean) => {
    showSubIssuesRange.value = value ? 'all' : 'hidden'
  },
})
const showBacklogIssues = computed({
  get: () => showTriageIssuesRange.value !== 'hidden',
  set: (value: boolean) => {
    showTriageIssuesRange.value = value ? 'all' : 'hidden'
  },
})
const orderCompletedByRecency = useLocalStorage('jira2.linear.orderCompletedByRecency', false)
const showEmptyGroups = useLocalStorage('jira2.linear.showEmptyGroups', false)
const collapsedIssueSectionIds = useLocalStorage<string[]>('jira2.linear.collapsedIssueSectionIds', [])
const collapsedProjectSectionIds = useLocalStorage<string[]>('jira2.linear.collapsedProjectSectionIds', [])
const visibleIssueRowFields = useLocalStorage<IssueRowFieldId[]>('jira2.linear.visibleIssueRowFields', [
  'id',
  'status',
  'assignee',
  'priority',
  'project',
  'due',
  'labels',
  'created',
])
const visibleProjectRowFields = useLocalStorage<ProjectRowFieldId[]>('jira2.linear.visibleProjectRowFields', [
  'health',
  'priority',
  'lead',
  'targetDate',
  'issues',
  'status',
])
const visibleInitiativeRowFields = useLocalStorage<InitiativeRowFieldId[]>('jira2.linear.visibleInitiativeRowFields', [
  'health',
  'lead',
  'projects',
  'issues',
  'updated',
])
const visibleSavedViewRowFields = useLocalStorage<SavedViewRowFieldId[]>('jira2.linear.visibleSavedViewRowFields', ['owner'])
const isResizingSidebar = ref(false)
const activePointerId = ref<number | null>(null)
const isCreateModalOpen = ref(false)
const isAddSpaceModalOpen = ref(false)
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
const filterMenuButtonRef = ref<HTMLButtonElement | null>(null)
const filterMenuPanelRef = ref<HTMLDivElement | null>(null)
const customViewContextMenuRef = ref<HTMLDivElement | null>(null)
const draggedIssueGroupId = ref<string | null>(null)
const pendingGotoKey = ref(false)
const focusedIssueKey = ref<string | null>(null)
const checkedIssueKeys = ref<string[]>([])
const selectionAnchorKey = ref<string | null>(null)
const activeInboxKey = ref<string | null>(null)
const inboxArchivedKeys = useLocalStorage<string[]>('jira2.linear.inboxArchivedKeys', [])
const inboxReadKeys = useLocalStorage<string[]>('jira2.linear.inboxReadKeys', [])
const searchResultTab = useLocalStorage<SearchResultTab>('jira2.linear.searchTab', 'all')
const filterMenuOpen = ref(false)
const activeFilterEntryId = ref<FilterEntryId>('status')
const activeDateFilterId = ref<DateFilterFieldId>('dueDate')
const activeProjectPropertyFilterId = ref<ProjectPropertyFilterFieldId>('projectStatus')
const filterFieldSearchQuery = ref('')
const filterSearchQuery = ref('')
const savedViewFilters = ref<Record<string, ViewFilterClause[]>>({})
const savedViewDisplays = ref<Record<string, CustomViewDisplay>>({})
type ViewEditorMode = 'create' | 'edit'
const viewEditorMode = ref<ViewEditorMode | null>(null)
const viewEditorDraft = ref<CustomView | null>(null)
const viewEditorPreviousViewId = ref<string | null>(null)
const viewEditorPreviousDisplay = ref<CustomViewDisplay | null>(null)
const suppressViewDisplaySync = ref(false)
const customViewContextMenu = ref({
  open: false,
  viewId: '',
  x: 0,
  y: 0,
})

type SearchResultTab = 'all' | 'issues' | 'projects' | 'initiatives' | 'documents'
type IssueRowFieldId =
  | 'id'
  | 'status'
  | 'assignee'
  | 'priority'
  | 'project'
  | 'due'
  | 'milestone'
  | 'release'
  | 'labels'
  | 'links'
  | 'timeInStatus'
  | 'created'
  | 'updated'
type ProjectRowFieldId = 'health' | 'priority' | 'lead' | 'targetDate' | 'issues' | 'status'
type InitiativeRowFieldId = 'health' | 'lead' | 'projects' | 'issues' | 'updated'
type SavedViewRowFieldId = 'type' | 'items' | 'owner' | 'updated'
type MyIssuesViewId = 'my-issues' | 'my-created'
type DateFilterOperator = 'hasDate' | 'noDate' | 'past' | 'today' | 'next7' | 'next30'
type DateFilterFieldId = 'dueDate' | 'createdDate' | 'updatedDate' | 'completedDate'
type ProjectPropertyFilterFieldId = 'projectStatus' | 'projectPriority' | 'projectLead'
type FilterContextKind = 'issues' | 'projects' | 'initiatives' | 'views'
type ViewsDirectoryTabId = 'views' | 'project-views'
type CustomViewKind = 'issues' | 'projects'
type FilterFieldId =
  | 'status'
  | 'assignee'
  | 'reporter'
  | 'priority'
  | 'labels'
  | 'suggestedLabel'
  | DateFilterFieldId
  | 'project'
  | ProjectPropertyFilterFieldId
  | 'initiative'
  | 'subscribers'
  | 'shared'
  | 'sharedWith'
  | 'externalSource'
const filterFieldIds = new Set<string>([
  'status',
  'assignee',
  'reporter',
  'priority',
  'labels',
  'suggestedLabel',
  'dueDate',
  'createdDate',
  'updatedDate',
  'completedDate',
  'project',
  'projectStatus',
  'projectPriority',
  'projectLead',
  'initiative',
  'subscribers',
  'shared',
  'sharedWith',
  'externalSource',
])
type FilterEntryId =
  | 'status'
  | 'assignee'
  | 'reporter'
  | 'priority'
  | 'labels'
  | 'suggestedLabel'
  | 'dates'
  | 'project'
  | 'projectProperties'
  | 'initiative'
  | 'subscribers'
  | 'shared'
  | 'sharedWith'
  | 'externalSource'

interface IssueSection {
  id: string
  label: string
  tickets: JiraTicket[]
}

interface IssueGroupOrderingRow {
  id: string
  label: string
  count: number
  visible: boolean
}

interface ViewTab {
  id: string
  label: string
  custom?: boolean
  draft?: boolean
}

interface FavoriteViewNavItem {
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
  targetDateValue?: string
  issueCount: number
  completedCount: number
  progress: number
  status: string
  updatedAt?: string
}

interface ProjectSection {
  id: string
  label: string
  projects: ProjectRow[]
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

interface ProjectRowFieldOption {
  id: ProjectRowFieldId
  label: string
}

interface InitiativeRowFieldOption {
  id: InitiativeRowFieldId
  label: string
}

interface SavedViewRowFieldOption {
  id: SavedViewRowFieldId
  label: string
}

interface IssueRowDisplayProps {
  showId: boolean
  showStatus: boolean
  showLabels: boolean
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

interface FilterMenuEntry {
  id: FilterEntryId
  label: string
  icon: string
  hasSubmenu: boolean
}

interface FilterOption {
  value: string
  label: string
  count: number
  icon: string
}

interface DateFilterOption {
  value: DateFilterOperator
  label: string
  count: number
}

interface ViewFilterClause {
  id: string
  fieldId: FilterFieldId
  fieldLabel: string
  value: string
  valueLabel: string
}

type IssueInclusionFilterId = 'completed' | 'subIssues' | 'backlog'
type ActiveFilterChip =
  | {
      kind: 'clause'
      id: string
      filterId: string
      fieldLabel: string
      valueLabel: string
    }
  | {
      kind: 'inclusion'
      id: string
      inclusionId: IssueInclusionFilterId
      fieldLabel: string
      valueLabel: string
    }

function getDefaultViewDisplay(): CustomViewDisplay {
  return {
    grouping: 'none',
    subGrouping: 'none',
    ordering: 'manual',
    groupingDirection: 'asc',
    orderingDirection: 'asc',
    completedRange: 'hidden',
    showSubIssueContext: true,
    showSubIssuesRange: 'hidden',
    showTriageIssuesRange: 'hidden',
    orderCompletedByRecency: false,
    showEmptyGroups: false,
    issueGroupOrders: {},
    hiddenIssueGroupIds: {},
    collapsedIssueSectionIds: [],
    visibleIssueRowFields: ['id', 'status', 'assignee', 'priority', 'project', 'due', 'labels', 'created'],
    visibleProjectRowFields: ['health', 'priority', 'lead', 'targetDate', 'issues', 'status'],
  }
}

function getLegacyImplicitViewDisplay(): CustomViewDisplay {
  return {
    ...getDefaultViewDisplay(),
    ordering: 'status',
    completedRange: 'hidden',
  }
}

function normalizeIssueGroupingFieldId(value: string): IssueGroupingFieldId {
  switch (value) {
    case 'none':
    case 'status':
    case 'assignee':
    case 'agent':
    case 'project':
    case 'priority':
    case 'label':
      return value
    default:
      return 'status'
  }
}

function parseIssueGroupingFieldId(value: string): IssueGroupingFieldId | null {
  switch (value) {
    case 'none':
    case 'status':
    case 'assignee':
    case 'agent':
    case 'project':
    case 'priority':
    case 'label':
      return value
    default:
      return null
  }
}

function normalizeIssueOrderingFieldId(value: string): IssueOrderingFieldId {
  switch (value) {
    case 'manual':
    case 'title':
    case 'status':
    case 'priority':
    case 'assignee':
    case 'agent':
    case 'estimate':
    case 'updated':
    case 'created':
    case 'due':
    case 'linkCount':
    case 'timeInStatus':
      return value
    default:
      return 'status'
  }
}

function normalizeIssueVisibilityRange(value: string): IssueVisibilityRange {
  switch (value) {
    case 'day':
    case 'week':
    case 'month':
    case 'all':
      return value
    case 'hidden':
    default:
      return 'hidden'
  }
}

function getLegacySubIssuesRange(display: CustomViewDisplay, defaults: CustomViewDisplay): IssueVisibilityRange {
  if (display.showSubIssuesRange) {
    return normalizeIssueVisibilityRange(display.showSubIssuesRange)
  }

  return (display.showSubIssueContext ?? defaults.showSubIssueContext) ? 'all' : 'hidden'
}

function normalizeDirection(value: string): 'asc' | 'desc' {
  return value === 'desc' ? 'desc' : 'asc'
}

function normalizeIssueRowFields(values: readonly string[]): IssueRowFieldId[] {
  const normalizedValues: IssueRowFieldId[] = []

  for (const value of values) {
    switch (value) {
      case 'id':
      case 'status':
      case 'assignee':
      case 'priority':
      case 'project':
      case 'due':
      case 'milestone':
      case 'release':
      case 'labels':
      case 'links':
      case 'timeInStatus':
      case 'created':
      case 'updated':
        if (!normalizedValues.includes(value)) {
          normalizedValues.push(value)
        }
        break
    }
  }

  return normalizedValues.length > 0 ? normalizedValues : ['id', 'status', 'assignee', 'priority', 'project', 'due', 'labels', 'created']
}

function normalizeProjectRowFields(values: readonly string[]): ProjectRowFieldId[] {
  const normalizedValues: ProjectRowFieldId[] = []

  for (const value of values) {
    switch (value) {
      case 'health':
      case 'priority':
      case 'lead':
      case 'targetDate':
      case 'issues':
      case 'status':
        if (!normalizedValues.includes(value)) {
          normalizedValues.push(value)
        }
        break
    }
  }

  return normalizedValues.length > 0 ? normalizedValues : ['health', 'priority', 'lead', 'targetDate', 'issues', 'status']
}

function copyIssueGroupConfigMap(value: IssueGroupConfigMap | Record<string, string[]>): Record<string, string[]> {
  const copy: Record<string, string[]> = {}

  for (const [key, entries] of Object.entries(value)) {
    if (entries && entries.length > 0) {
      copy[key] = [...entries]
    }
  }

  return copy
}

function normalizeIssueGroupConfigMap(value: Record<string, string[]>): IssueGroupConfigMap {
  const normalizedValue: IssueGroupConfigMap = {}

  for (const [key, entries] of Object.entries(value)) {
    const fieldId = parseIssueGroupingFieldId(key)
    if (!fieldId) {
      continue
    }

    if (entries.length > 0) {
      normalizedValue[fieldId] = [...entries]
    }
  }

  return normalizedValue
}

function stringArraysMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function stringSetsMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every(value => right.includes(value))
}

function filterClausesMatch(left: readonly ViewFilterClause[], right: readonly ViewFilterClause[]): boolean {
  return left.length === right.length
    && left.every(filter => right.some(candidate => (
      candidate.fieldId === filter.fieldId
      && candidate.value === filter.value
    )))
}

function filterGroupsMatch<Item>(
  item: Item,
  filters: readonly ViewFilterClause[],
  matchesFilter: (item: Item, filter: ViewFilterClause) => boolean,
): boolean {
  const filtersByField = new Map<FilterFieldId, ViewFilterClause[]>()

  for (const filter of filters) {
    const existingFilters = filtersByField.get(filter.fieldId)
    if (existingFilters) {
      existingFilters.push(filter)
      continue
    }

    filtersByField.set(filter.fieldId, [filter])
  }

  for (const filtersForField of filtersByField.values()) {
    if (!filtersForField.some(filter => matchesFilter(item, filter))) {
      return false
    }
  }

  return true
}

function issueGroupConfigMapsMatch(left: IssueGroupConfigMap, right: IssueGroupConfigMap): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])

  for (const key of keys) {
    const fieldId = parseIssueGroupingFieldId(key)
    if (!fieldId) {
      continue
    }

    const leftEntries = left[fieldId] ?? []
    const rightEntries = right[fieldId] ?? []
    if (!stringArraysMatch(leftEntries, rightEntries)) {
      return false
    }
  }

  return true
}

function viewDisplayMatches(left: CustomViewDisplay, right: CustomViewDisplay): boolean {
  return left.grouping === right.grouping
    && left.subGrouping === right.subGrouping
    && left.ordering === right.ordering
    && left.groupingDirection === right.groupingDirection
    && left.orderingDirection === right.orderingDirection
    && left.completedRange === right.completedRange
    && left.showSubIssueContext === right.showSubIssueContext
    && left.showSubIssuesRange === right.showSubIssuesRange
    && left.showTriageIssuesRange === right.showTriageIssuesRange
    && left.orderCompletedByRecency === right.orderCompletedByRecency
    && left.showEmptyGroups === right.showEmptyGroups
    && issueGroupConfigMapsMatch(normalizeIssueGroupConfigMap(left.issueGroupOrders), normalizeIssueGroupConfigMap(right.issueGroupOrders))
    && issueGroupConfigMapsMatch(normalizeIssueGroupConfigMap(left.hiddenIssueGroupIds), normalizeIssueGroupConfigMap(right.hiddenIssueGroupIds))
    && stringArraysMatch(left.collapsedIssueSectionIds, right.collapsedIssueSectionIds)
    && stringSetsMatch(left.visibleIssueRowFields, right.visibleIssueRowFields)
    && stringSetsMatch(left.visibleProjectRowFields, right.visibleProjectRowFields)
}

function copyViewDisplay(display: CustomViewDisplay): CustomViewDisplay {
  const defaults = getDefaultViewDisplay()

  return {
    grouping: display.grouping ?? defaults.grouping,
    subGrouping: display.subGrouping ?? defaults.subGrouping,
    ordering: display.ordering ?? defaults.ordering,
    groupingDirection: display.groupingDirection ?? defaults.groupingDirection,
    orderingDirection: display.orderingDirection ?? defaults.orderingDirection,
    completedRange: display.completedRange ?? defaults.completedRange,
    showSubIssueContext: display.showSubIssueContext ?? defaults.showSubIssueContext,
    showSubIssuesRange: display.showSubIssuesRange ?? getLegacySubIssuesRange(display, defaults),
    showTriageIssuesRange: display.showTriageIssuesRange ?? defaults.showTriageIssuesRange,
    orderCompletedByRecency: display.orderCompletedByRecency ?? defaults.orderCompletedByRecency,
    showEmptyGroups: display.showEmptyGroups ?? defaults.showEmptyGroups,
    issueGroupOrders: copyIssueGroupConfigMap(display.issueGroupOrders ?? defaults.issueGroupOrders),
    hiddenIssueGroupIds: copyIssueGroupConfigMap(display.hiddenIssueGroupIds ?? defaults.hiddenIssueGroupIds),
    collapsedIssueSectionIds: [...(display.collapsedIssueSectionIds ?? defaults.collapsedIssueSectionIds)],
    visibleIssueRowFields: [...(display.visibleIssueRowFields ?? defaults.visibleIssueRowFields)],
    visibleProjectRowFields: [...(display.visibleProjectRowFields ?? defaults.visibleProjectRowFields)],
  }
}

function captureDisplay(): CustomViewDisplay {
  return {
    grouping: listGrouping.value,
    subGrouping: listSubGrouping.value,
    ordering: listOrdering.value,
    groupingDirection: listGroupingDirection.value,
    orderingDirection: listOrderingDirection.value,
    completedRange: completedRange.value,
    showSubIssueContext: showSubIssueContext.value,
    showSubIssuesRange: showSubIssuesRange.value,
    showTriageIssuesRange: showTriageIssuesRange.value,
    orderCompletedByRecency: orderCompletedByRecency.value,
    showEmptyGroups: showEmptyGroups.value,
    issueGroupOrders: copyIssueGroupConfigMap(issueGroupOrders.value),
    hiddenIssueGroupIds: copyIssueGroupConfigMap(hiddenIssueGroupIds.value),
    collapsedIssueSectionIds: [...collapsedIssueSectionIds.value],
    visibleIssueRowFields: [...visibleIssueRowFields.value],
    visibleProjectRowFields: [...visibleProjectRowFields.value],
  }
}

function applyDisplay(display: CustomViewDisplay): void {
  listGrouping.value = normalizeIssueGroupingFieldId(display.grouping)
  listSubGrouping.value = normalizeIssueGroupingFieldId(display.subGrouping)
  listOrdering.value = normalizeIssueOrderingFieldId(display.ordering)
  listGroupingDirection.value = normalizeDirection(display.groupingDirection)
  listOrderingDirection.value = normalizeDirection(display.orderingDirection)
  completedRange.value = normalizeIssueVisibilityRange(display.completedRange)
  showSubIssueContext.value = display.showSubIssueContext
  showSubIssuesRange.value = getLegacySubIssuesRange(display, getDefaultViewDisplay())
  showTriageIssuesRange.value = normalizeIssueVisibilityRange(display.showTriageIssuesRange)
  orderCompletedByRecency.value = display.orderCompletedByRecency
  showEmptyGroups.value = display.showEmptyGroups
  issueGroupOrders.value = normalizeIssueGroupConfigMap(display.issueGroupOrders)
  hiddenIssueGroupIds.value = normalizeIssueGroupConfigMap(display.hiddenIssueGroupIds)
  collapsedIssueSectionIds.value = [...display.collapsedIssueSectionIds]
  visibleIssueRowFields.value = normalizeIssueRowFields(display.visibleIssueRowFields)
  visibleProjectRowFields.value = normalizeProjectRowFields(display.visibleProjectRowFields)
}

function normalizeFilterFieldId(value: string): FilterFieldId | null {
  switch (value) {
    case 'status':
    case 'assignee':
    case 'reporter':
    case 'priority':
    case 'labels':
    case 'suggestedLabel':
    case 'dueDate':
    case 'createdDate':
    case 'updatedDate':
    case 'completedDate':
    case 'project':
    case 'projectStatus':
    case 'projectPriority':
    case 'projectLead':
    case 'initiative':
    case 'subscribers':
    case 'shared':
    case 'sharedWith':
    case 'externalSource':
      return value
    default:
      return null
  }
}

function customViewFiltersToClauses(filters: readonly CustomViewFilter[]): ViewFilterClause[] {
  const clauses: ViewFilterClause[] = []

  for (const filter of filters) {
    const fieldId = normalizeFilterFieldId(filter.fieldId)
    if (!fieldId) {
      continue
    }

    clauses.push({
      id: filter.id,
      fieldId,
      fieldLabel: filter.fieldLabel,
      value: filter.value,
      valueLabel: filter.valueLabel,
    })
  }

  return clauses
}

function clausesToCustomViewFilters(filters: readonly ViewFilterClause[]): CustomViewFilter[] {
  return filters.map(filter => ({
    id: filter.id,
    fieldId: filter.fieldId,
    fieldLabel: filter.fieldLabel,
    value: filter.value,
    valueLabel: filter.valueLabel,
  }))
}

function createViewFilterClause(fieldId: FilterFieldId, value: string, valueLabel: string): ViewFilterClause {
  return {
    id: `default:${fieldId}:${value}`,
    fieldId,
    fieldLabel: getFilterFieldLabel(fieldId),
    value,
    valueLabel,
  }
}

function hasSavedViewFilterOverride(viewId: string): boolean {
  return Object.prototype.hasOwnProperty.call(savedViewFilters.value, viewId)
}

function hasSavedViewDisplayOverride(viewId: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(savedViewDisplays.value, viewId)) {
    return false
  }

  const display = savedViewDisplays.value[viewId]
  if (!display) {
    return false
  }

  return !viewDisplayMatches(copyViewDisplay(display), getLegacyImplicitViewDisplay())
}

function getDefaultFiltersForView(viewId: string): ViewFilterClause[] {
  if (viewEditorDraft.value?.id === viewId) {
    return customViewFiltersToClauses(viewEditorDraft.value.filters)
  }

  const customView = getCustomView(viewId)
  if (customView) {
    return customViewFiltersToClauses(customView.filters)
  }

  if (viewId === 'my-issues') {
    return [createViewFilterClause('assignee', 'current-user', 'Current user')]
  }

  if (viewId === 'my-created') {
    return [createViewFilterClause('reporter', 'current-user', 'Current user')]
  }

  if (viewId === 'ready-qa') {
    return [createViewFilterClause('status', 'ready-for-qa', 'Ready for QA')]
  }

  const [scope, , section] = viewId.split(':')
  if (scope !== 'team') {
    return []
  }

  if (section === 'ready-qa') {
    return [createViewFilterClause('status', 'ready-for-qa', 'Ready for QA')]
  }

  return []
}

function getDefaultDisplayForView(viewId: string): CustomViewDisplay {
  if (viewEditorDraft.value?.id === viewId) {
    return copyViewDisplay(viewEditorDraft.value.display)
  }

  const customView = getCustomView(viewId)
  if (customView) {
    return copyViewDisplay(customView.display)
  }

  const display = getDefaultViewDisplay()
  const [, , section] = viewId.split(':')

  return section === 'backlog' || section === 'triage'
    ? { ...display, showTriageIssuesRange: 'all' }
    : display
}

function copyCustomView(view: CustomView): CustomView {
  return {
    ...view,
    filters: view.filters.map(filter => ({ ...filter })),
    display: copyViewDisplay(view.display),
  }
}

const issueRowFieldOptions: IssueRowFieldOption[] = [
  { id: 'id', label: 'ID' },
  { id: 'status', label: 'Status' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'priority', label: 'Priority' },
  { id: 'project', label: 'Project' },
  { id: 'due', label: 'Due date' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'release', label: 'Release' },
  { id: 'labels', label: 'Labels' },
  { id: 'links', label: 'Links' },
  { id: 'timeInStatus', label: 'Time in status' },
  { id: 'created', label: 'Created' },
  { id: 'updated', label: 'Updated' },
]

const issueGroupingOptions: Array<{ id: IssueGroupingFieldId, label: string }> = [
  { id: 'none', label: 'No grouping' },
  { id: 'status', label: 'Status' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'agent', label: 'Agent' },
  { id: 'project', label: 'Project' },
  { id: 'priority', label: 'Priority' },
  { id: 'label', label: 'Label' },
]

const issueOrderingOptions: Array<{ id: IssueOrderingFieldId, label: string }> = [
  { id: 'manual', label: 'Manual' },
  { id: 'title', label: 'Title' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'agent', label: 'Agent' },
  { id: 'estimate', label: 'Estimate' },
  { id: 'updated', label: 'Updated' },
  { id: 'created', label: 'Created' },
  { id: 'due', label: 'Due date' },
  { id: 'linkCount', label: 'Link count' },
  { id: 'timeInStatus', label: 'Time in status' },
]

const projectGroupingOptions: Array<{ id: ProjectGroupingFieldId, label: string }> = [
  { id: 'none', label: 'No grouping' },
  { id: 'health', label: 'Health' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'lead', label: 'Lead' },
]

const projectOrderingOptions: Array<{ id: ProjectOrderingFieldId, label: string }> = [
  { id: 'manual', label: 'Manual' },
  { id: 'name', label: 'Name' },
  { id: 'health', label: 'Health' },
  { id: 'priority', label: 'Priority' },
  { id: 'lead', label: 'Lead' },
  { id: 'targetDate', label: 'Target date' },
  { id: 'updated', label: 'Updated' },
  { id: 'progress', label: 'Progress' },
]

const projectClosedRangeOptions: Array<{ id: ProjectClosedRange, label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'hidden', label: 'Hide' },
]

const issueVisibilityRangeOptions: Array<{ id: IssueVisibilityRange, label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'day', label: 'Past day' },
  { id: 'week', label: 'Past week' },
  { id: 'month', label: 'Past month' },
  { id: 'hidden', label: 'None' },
]

const projectRowFieldOptions: ProjectRowFieldOption[] = [
  { id: 'health', label: 'Health' },
  { id: 'priority', label: 'Priority' },
  { id: 'lead', label: 'Lead' },
  { id: 'targetDate', label: 'Target date' },
  { id: 'issues', label: 'Issues' },
  { id: 'status', label: 'Status' },
]

const initiativeRowFieldOptions: InitiativeRowFieldOption[] = [
  { id: 'health', label: 'Health' },
  { id: 'lead', label: 'Lead' },
  { id: 'projects', label: 'Projects' },
  { id: 'issues', label: 'Issues' },
  { id: 'updated', label: 'Updated' },
]

const savedViewRowFieldOptions: SavedViewRowFieldOption[] = [
  { id: 'type', label: 'Type' },
  { id: 'items', label: 'Items' },
  { id: 'owner', label: 'Owner' },
  { id: 'updated', label: 'Updated' },
]

const filterMenuEntries: FilterMenuEntry[] = [
  { id: 'status', label: 'Status', icon: '◌', hasSubmenu: true },
  { id: 'assignee', label: 'Assignee', icon: '♙', hasSubmenu: true },
  { id: 'reporter', label: 'Creator', icon: '♙', hasSubmenu: true },
  { id: 'priority', label: 'Priority', icon: '▥', hasSubmenu: true },
  { id: 'labels', label: 'Labels', icon: '▭', hasSubmenu: true },
  { id: 'suggestedLabel', label: 'Suggested label', icon: '▰', hasSubmenu: true },
  { id: 'dates', label: 'Dates', icon: '□', hasSubmenu: true },
  { id: 'project', label: 'Project', icon: '◇', hasSubmenu: true },
  { id: 'projectProperties', label: 'Project properties', icon: '◈', hasSubmenu: true },
  { id: 'initiative', label: 'Initiative', icon: '◒', hasSubmenu: true },
  { id: 'subscribers', label: 'Subscribers', icon: '♧', hasSubmenu: true },
  { id: 'shared', label: 'Shared', icon: '♢', hasSubmenu: false },
  { id: 'sharedWith', label: 'Shared with', icon: '♧', hasSubmenu: true },
  { id: 'externalSource', label: 'External source', icon: '◇', hasSubmenu: true },
]

const dateFilterFields: Array<{ id: DateFilterFieldId, label: string, icon: string }> = [
  { id: 'dueDate', label: 'Due date', icon: '□' },
  { id: 'createdDate', label: 'Created date', icon: '◱' },
  { id: 'updatedDate', label: 'Updated date', icon: '◲' },
  { id: 'completedDate', label: 'Completed date', icon: '◳' },
]

const projectPropertyFilterFields: Array<{ id: ProjectPropertyFilterFieldId, label: string, icon: string }> = [
  { id: 'projectStatus', label: 'Project status', icon: '◌' },
  { id: 'projectPriority', label: 'Project priority', icon: '▥' },
  { id: 'projectLead', label: 'Project lead', icon: '♙' },
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
const backlogTickets = computed(() => issueTickets.value.filter(isBacklogIssueTicket))
const currentUserName = computed(() => jiraMeQuery.data.value?.displayName.trim() ?? '')
const selectedTicket = computed(() => (
  selectedKey.value ? tickets.value.find(ticket => ticket.key === selectedKey.value) ?? null : null
))
const issueRowDisplayProps = computed<IssueRowDisplayProps>(() => ({
  showId: isIssueRowFieldVisible('id'),
  showStatus: isIssueRowFieldVisible('status'),
  showLabels: isIssueRowFieldVisible('labels'),
  showPriority: isIssueRowFieldVisible('priority'),
  showAssignee: isIssueRowFieldVisible('assignee'),
  showCreated: isIssueRowFieldVisible('created'),
  showUpdated: isIssueRowFieldVisible('updated'),
  showDue: isIssueRowFieldVisible('due'),
  showParent: isIssueRowFieldVisible('project'),
}))
const projectGridTemplate = computed(() => getProjectGridTemplate())
const initiativeGridTemplate = computed(() => getInitiativeGridTemplate())
const savedViewGridTemplate = computed(() => getSavedViewGridTemplate())

const effectiveSidebarWidth = computed(() => (
  sidebarCollapsed.value ? collapsedSidebarWidth : sidebarWidth.value
))

const showInitialWorkspaceOverlay = computed(() => (
  !hasFinishedInitialWorkspaceLoad.value
  && !isLoadingSpaceSettings.value
  && hasJiraCredentialsConfigured.value
  && fetching.value
))

const activeCustomView = computed(() => {
  if (viewEditorDraft.value && currentView.value === viewEditorDraft.value.id) {
    return viewEditorDraft.value
  }

  return getCustomView(currentView.value)
})

function getBaseViewIdForCustomContext(contextKey: string): string {
  const [scope, key, section] = contextKey.split(':')

  if (scope === 'team' && key) {
    return section === 'projects' ? `team:${key}:projects` : `team:${key}:all`
  }

  return contextKey
}

const activeBaseViewId = computed(() => (
  activeCustomView.value ? getBaseViewIdForCustomContext(activeCustomView.value.contextKey) : currentView.value
))

function getContextKeyForViewId(viewId: string): string | null {
  const [scope, key, section] = viewId.split(':')

  if (scope === 'team' && key) {
    if (section === 'views') {
      return `team:${key}:issues`
    }

    if (section === 'project-views') {
      return `team:${key}:projects`
    }

    if (section === 'projects') {
      return `team:${key}:projects`
    }

    if (section === 'all' || section === 'active' || section === 'backlog') {
      return `team:${key}:issues`
    }

    return null
  }

  if (viewId === 'projects') {
    return 'projects'
  }

  if (viewId === 'views') {
    return 'my-issues'
  }

  if (viewId === 'project-views') {
    return 'projects'
  }

  if (isMyIssuesView(viewId)) {
    return 'my-issues'
  }

  return null
}

const activeCustomViewContextKey = computed(() => activeCustomView.value?.contextKey ?? null)
const contextKeyForCurrentView = computed(() => activeCustomViewContextKey.value ?? getContextKeyForViewId(activeBaseViewId.value))
const supportsCustomViews = computed(() => contextKeyForCurrentView.value !== null)

const currentTeamKey = computed(() => {
  const [scope, key] = activeBaseViewId.value.split(':')
  return scope === 'team' ? key ?? null : null
})

const currentTeamName = computed(() => {
  const key = currentTeamKey.value
  if (!key) return null
  return enabledSpaces.value.find(space => space.key === key)?.name ?? key
})

const currentTeamSection = computed(() => {
  const [scope, , section] = activeBaseViewId.value.split(':')
  return scope === 'team' ? section ?? 'active' : null
})

function getViewsDirectoryTabFromViewId(viewId: string): ViewsDirectoryTabId | null {
  if (viewId === 'views' || viewId === 'project-views') {
    return viewId
  }

  const [scope, , section] = viewId.split(':')
  if (scope === 'team' && (section === 'views' || section === 'project-views')) {
    return section
  }

  return null
}

const isViewsDirectory = computed(() => getViewsDirectoryTabFromViewId(currentView.value) !== null)
const activeViewsDirectoryTab = computed<ViewsDirectoryTabId>(() => getViewsDirectoryTabFromViewId(currentView.value) ?? 'views')
const isProjectDisplayView = computed(() => activeBaseViewId.value === 'projects' || currentTeamSection.value === 'projects')
const isInitiativeDisplayView = computed(() => currentView.value === 'initiatives')
const isSavedViewDisplayView = computed(() => isViewsDirectory.value)
const isIssueDisplayView = computed(() => (
  !isProjectDisplayView.value
  && !isInitiativeDisplayView.value
  && !isSavedViewDisplayView.value
  && currentView.value !== 'inbox'
))
const currentTeamTickets = computed(() => {
  const key = currentTeamKey.value
  if (!key) return []
  return issueTickets.value.filter(ticket => ticket.spaceKey === key)
})
const isReadyQaView = computed(() => currentView.value === 'ready-qa' || currentTeamSection.value === 'ready-qa')

function isMyIssuesView(viewId: string): viewId is MyIssuesViewId {
  return viewId === 'my-issues'
    || viewId === 'my-created'
}

watchEffect(() => {
  if (currentView.value === 'my-subscribed' || currentView.value === 'my-activity') {
    currentView.value = 'my-issues'
  }
})

const viewTitle = computed(() => {
  if (selectedTicket.value) return selectedTicket.value.key
  if (activeCustomView.value) return activeCustomView.value.name
  if (currentView.value === 'inbox') return 'Inbox'
  if (isMyIssuesView(activeBaseViewId.value)) return 'My issues'
  if (currentView.value === 'initiatives') return 'Initiatives'
  if (activeBaseViewId.value === 'projects') return 'Projects'
  if (isViewsDirectory.value) return 'Views'
  if (currentView.value === 'search') return 'Search'
  if (currentView.value === 'ready-qa') return 'Ready for QA'
  if (currentTeamName.value) return currentTeamName.value
  return 'Issues'
})

const customViewTabs = computed<ViewTab[]>(() => {
  const contextKey = contextKeyForCurrentView.value
  if (!contextKey) {
    return []
  }

  const draft = viewEditorDraft.value
  const tabs: ViewTab[] = customViewsForContext(contextKey)
    .filter(view => view.id !== draft?.id)
    .map(view => ({
      id: view.id,
      label: view.name,
      custom: true,
    }))

  if (draft && draft.contextKey === contextKey) {
    tabs.push({
      id: draft.id,
      label: draft.name.trim() || 'New view',
      custom: true,
      draft: true,
    })
  }

  return tabs
})

const viewTabs = computed<ViewTab[]>(() => {
  if (isMyIssuesView(activeBaseViewId.value)) {
    return [
      { id: 'my-issues', label: 'Assigned' },
      { id: 'my-created', label: 'Created' },
      ...customViewTabs.value,
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
      ...customViewTabs.value,
    ]
  }

  if (activeBaseViewId.value === 'projects' || currentTeamSection.value === 'projects') {
    return [
      { id: activeBaseViewId.value, label: 'All projects' },
      ...customViewTabs.value,
    ]
  }

  if (isViewsDirectory.value) {
    const tabPrefix = currentTeamKey.value ? `team:${currentTeamKey.value}:` : ''
    return [
      { id: `${tabPrefix}views`, label: 'Issues' },
      { id: `${tabPrefix}project-views`, label: 'Projects' },
    ]
  }

  return []
})

const scopedTickets = computed(() => {
  if (activeBaseViewId.value === 'inbox') {
    return backlogTickets.value
  }

  if (activeBaseViewId.value === 'ready-qa') {
    return issueTickets.value
  }

  if (activeBaseViewId.value === 'my-created') {
    return issueTickets.value
  }

  if (activeBaseViewId.value === 'my-issues') {
    return issueTickets.value
  }

  if (currentTeamKey.value) {
    const teamTickets = currentTeamTickets.value
    return teamTickets
  }

  return issueTickets.value
})

const normalizedIssueSearch = computed(() => issueSearch.value.trim().toLowerCase())
const normalizedFilterSearch = computed(() => filterSearchQuery.value.trim().toLowerCase())
const normalizedFilterFieldSearch = computed(() => filterFieldSearchQuery.value.trim().toLowerCase())
const currentViewFilters = computed(() => {
  if (viewEditorDraft.value && currentView.value === viewEditorDraft.value.id) {
    return customViewFiltersToClauses(viewEditorDraft.value.filters)
  }

  if (hasSavedViewFilterOverride(currentView.value)) {
    return savedViewFilters.value[currentView.value] ?? []
  }

  return getDefaultFiltersForView(currentView.value)
})
const hasIssueInclusionFilters = computed(() => {
  if (!isIssueDisplayView.value) {
    return false
  }

  const defaults = getDefaultDisplayForView(currentView.value)
  return completedRange.value !== defaults.completedRange
    || showSubIssuesRange.value !== defaults.showSubIssuesRange
    || showTriageIssuesRange.value !== defaults.showTriageIssuesRange
})
const hasCurrentViewFilters = computed(() => currentViewFilters.value.length > 0 || hasIssueInclusionFilters.value)
const activeFilterChips = computed<ActiveFilterChip[]>(() => {
  const chips: ActiveFilterChip[] = currentViewFilters.value.map((filter): ActiveFilterChip => ({
    kind: 'clause',
    id: filter.id,
    filterId: filter.id,
    fieldLabel: filter.fieldLabel,
    valueLabel: filter.valueLabel,
  }))

  if (!isIssueDisplayView.value) {
    return chips
  }

  const defaults = getDefaultDisplayForView(currentView.value)
  if (completedRange.value !== defaults.completedRange) {
    chips.push({
      kind: 'inclusion',
      id: 'issue-inclusion:completed',
      inclusionId: 'completed',
      fieldLabel: 'Completed issues',
      valueLabel: getIssueVisibilityRangeLabel(completedRange.value),
    })
  }

  if (showSubIssuesRange.value !== defaults.showSubIssuesRange) {
    chips.push({
      kind: 'inclusion',
      id: 'issue-inclusion:sub-issues',
      inclusionId: 'subIssues',
      fieldLabel: 'Sub-issues',
      valueLabel: getIssueVisibilityRangeLabel(showSubIssuesRange.value),
    })
  }

  if (showTriageIssuesRange.value !== defaults.showTriageIssuesRange) {
    chips.push({
      kind: 'inclusion',
      id: 'issue-inclusion:backlog',
      inclusionId: 'backlog',
      fieldLabel: 'Backlog',
      valueLabel: getIssueVisibilityRangeLabel(showTriageIssuesRange.value),
    })
  }

  return chips
})
const hasModifiedFilterOptions = computed(() => {
  const defaults = getDefaultDisplayForView(currentView.value)

  return !filterClausesMatch(currentViewFilters.value, getDefaultFiltersForView(currentView.value))
    || (isIssueDisplayView.value && (
      completedRange.value !== defaults.completedRange
      || showSubIssuesRange.value !== defaults.showSubIssuesRange
      || showTriageIssuesRange.value !== defaults.showTriageIssuesRange
    ))
})
const hasModifiedDisplayOptions = computed(() => {
  const defaults = getDefaultDisplayForView(currentView.value)

  if (isProjectDisplayView.value) {
    return projectGrouping.value !== 'none'
      || projectOrdering.value !== 'manual'
      || projectClosedRange.value !== 'all'
      || !stringSetsMatch(visibleProjectRowFields.value, defaults.visibleProjectRowFields)
  }

  if (isInitiativeDisplayView.value) {
    return !stringSetsMatch(visibleInitiativeRowFields.value, ['health', 'lead', 'projects', 'issues', 'updated'])
  }

  if (isSavedViewDisplayView.value) {
    return !stringSetsMatch(visibleSavedViewRowFields.value, ['owner'])
  }

  if (!isIssueDisplayView.value) {
    return false
  }

  return listGrouping.value !== defaults.grouping
    || listSubGrouping.value !== defaults.subGrouping
    || listOrdering.value !== defaults.ordering
    || listGroupingDirection.value !== defaults.groupingDirection
    || listOrderingDirection.value !== defaults.orderingDirection
    || orderCompletedByRecency.value !== defaults.orderCompletedByRecency
    || showEmptyGroups.value !== defaults.showEmptyGroups
    || !stringSetsMatch(visibleIssueRowFields.value, defaults.visibleIssueRowFields)
    || !issueGroupConfigMapsMatch(issueGroupOrders.value, {})
    || !issueGroupConfigMapsMatch(hiddenIssueGroupIds.value, {})
})
const visibleFilterMenuEntries = computed<FilterMenuEntry[]>(() => {
  const query = normalizedFilterFieldSearch.value
  if (!query) return filterMenuEntries
  return filterMenuEntries.filter(entry => entry.label.toLowerCase().includes(query))
})
const activeFilterEntry = computed<FilterMenuEntry>(() => {
  const entry = filterMenuEntries.find(candidate => candidate.id === activeFilterEntryId.value)
  return entry ?? {
    id: 'status',
    label: 'Status',
    icon: '◌',
    hasSubmenu: true,
  }
})
const activeValueFilterFieldId = computed<FilterFieldId>(() => {
  if (activeFilterEntryId.value === 'dates') return activeDateFilterId.value
  if (activeFilterEntryId.value === 'projectProperties') return activeProjectPropertyFilterId.value
  if (activeFilterEntryId.value === 'status') return 'status'
  if (activeFilterEntryId.value === 'assignee') return 'assignee'
  if (activeFilterEntryId.value === 'reporter') return 'reporter'
  if (activeFilterEntryId.value === 'priority') return 'priority'
  if (activeFilterEntryId.value === 'labels') return 'labels'
  if (activeFilterEntryId.value === 'suggestedLabel') return 'suggestedLabel'
  if (activeFilterEntryId.value === 'project') return 'project'
  if (activeFilterEntryId.value === 'initiative') return 'initiative'
  if (activeFilterEntryId.value === 'subscribers') return 'subscribers'
  if (activeFilterEntryId.value === 'shared') return 'shared'
  if (activeFilterEntryId.value === 'sharedWith') return 'sharedWith'
  return 'externalSource'
})
const filterableTickets = computed(() => filterTicketsForCurrentView(scopedTickets.value))
const activeFilterOptions = computed<FilterOption[]>(() => {
  const options = getFilterOptions(activeValueFilterFieldId.value)
  const query = normalizedFilterSearch.value
  if (!query) return options
  return options.filter(option => option.label.toLowerCase().includes(query))
})
const activeDateFilterOptions = computed<DateFilterOption[]>(() => getDateFilterOptions(activeDateFilterId.value))

function resolveDisplayForView(viewId: string): CustomViewDisplay {
  if (viewEditorDraft.value?.id === viewId) {
    return copyViewDisplay(viewEditorDraft.value.display)
  }

  if (hasSavedViewDisplayOverride(viewId)) {
    return copyViewDisplay(savedViewDisplays.value[viewId] ?? getDefaultDisplayForView(viewId))
  }

  return getDefaultDisplayForView(viewId)
}

function persistDisplayForView(viewId: string, display: CustomViewDisplay): void {
  if (viewEditorDraft.value?.id === viewId) {
    viewEditorDraft.value = {
      ...viewEditorDraft.value,
      display: copyViewDisplay(display),
    }
    return
  }

  const normalizedDisplay = copyViewDisplay(display)
  const defaultDisplay = getDefaultDisplayForView(viewId)
  const nextDisplays = { ...savedViewDisplays.value }

  if (viewDisplayMatches(normalizedDisplay, defaultDisplay)) {
    delete nextDisplays[viewId]
    savedViewDisplays.value = nextDisplays
    return
  }

  savedViewDisplays.value = {
    ...nextDisplays,
    [viewId]: normalizedDisplay,
  }
}

watch(currentView, (nextViewId, previousViewId) => {
  if (suppressViewDisplaySync.value) {
    return
  }

  if (previousViewId) {
    persistDisplayForView(previousViewId, captureDisplay())
  }

  applyDisplay(resolveDisplayForView(nextViewId))
}, { immediate: true })

watch(visibleFilterMenuEntries, entries => {
  const firstEntry = entries[0]
  if (!firstEntry || entries.some(entry => entry.id === activeFilterEntryId.value)) return
  activeFilterEntryId.value = firstEntry.id
})

const baseSearchedTickets = computed(() => {
  const query = currentView.value === 'search' ? normalizedIssueSearch.value : ''
  const baseTickets = currentView.value === 'search'
    ? filterTicketsForCurrentView(issueTickets.value)
    : filterTicketsForCurrentView(scopedTickets.value)
  if (!query) return baseTickets

  return baseTickets.filter(ticket => ticketMatchesQuery(ticket, query))
})

const searchedTickets = computed(() => {
  const filteredTickets = applyViewFiltersToTickets(baseSearchedTickets.value)
  return showSubIssues.value ? filteredTickets : hideSubIssuesWithVisibleParents(filteredTickets)
})

const searchedProjectRows = computed(() => {
  const query = normalizedIssueSearch.value
  const baseProjects = applyViewFiltersToProjects(projectRows.value)
  if (!query) return baseProjects

  return baseProjects.filter(project => [
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
  const baseInitiatives = applyViewFiltersToInitiatives(initiativeRows.value)
  if (!query) return baseInitiatives

  return baseInitiatives.filter(initiative => [
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

const baseIssueSections = computed<IssueSection[]>(() => {
  if (isMyIssuesView(currentView.value) && listGrouping.value === 'none') {
    const label = currentView.value === 'my-created' ? 'Created by you' : 'Assigned to you'

    return [{
      id: currentView.value,
      label,
      tickets: sortTickets(searchedTickets.value),
    }]
  }

  if (listGrouping.value === 'none' || currentView.value === 'search') {
    return [{
      id: 'all',
      label: searchedTickets.value.length === 1 ? '1 issue' : `${searchedTickets.value.length} issues`,
      tickets: sortTickets(searchedTickets.value),
    }]
  }

  return groupTickets(
    searchedTickets.value,
    ticket => getIssueGroupingLabels(ticket, listGrouping.value),
    label => getIssueGroupingRank(label, listGrouping.value),
  )
})

const issueSections = computed<IssueSection[]>(() => (
  baseIssueSections.value.filter(section => !isIssueGroupHidden(section.id))
))

const issueGroupOrderingRows = computed<IssueGroupOrderingRow[]>(() => (
  baseIssueSections.value.map(section => ({
    id: section.id,
    label: section.label,
    count: section.tickets.length,
    visible: !isIssueGroupHidden(section.id),
  }))
))

const visibleIssueCount = computed(() => issueSections.value.reduce((count, section) => count + section.tickets.length, 0))
const hiddenCompletedCount = computed(() => (
  completedRange.value === 'all'
    ? 0
    : scopedTickets.value.filter(ticket => !isCompletedIssueVisible(ticket)).length
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
  sortTicketsByActivity(applyViewFiltersToTickets(backlogTickets.value))
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
        targetDateValue: project.targetDate,
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

const baseDisplayedProjectRows = computed(() => {
  const key = currentTeamKey.value
  if (currentTeamSection.value !== 'projects' || !key) {
    return projectRows.value
  }

  return projectRows.value.filter(project => project.spaceKey === key)
})

const displayedProjectRows = computed(() => sortProjectsByOrdering(
  applyProjectClosedRange(applyViewFiltersToProjects(baseDisplayedProjectRows.value)),
))
const projectSections = computed<ProjectSection[]>(() => {
  if (projectGrouping.value === 'none') {
    return [{
      id: 'all',
      label: displayedProjectRows.value.length === 1 ? '1 project' : `${displayedProjectRows.value.length} projects`,
      projects: displayedProjectRows.value,
    }]
  }

  return groupProjects(displayedProjectRows.value, projectGrouping.value)
})
const visibleProjectCount = computed(() => projectSections.value.reduce((count, section) => count + section.projects.length, 0))

const baseInitiativeRows = computed<InitiativeRow[]>(() => {
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

const initiativeRows = computed(() => applyViewFiltersToInitiatives(baseInitiativeRows.value))

const savedViewRows = computed<SavedViewRow[]>(() => (
  customViews.value
    .filter(view => customViewBelongsInCurrentViewsDirectory(view))
    .map(view => customViewToSavedViewRow(view))
))

const baseDisplayedSavedViewRows = computed(() => savedViewRows.value)
const displayedSavedViewRows = computed(() => applyViewFiltersToSavedViews(baseDisplayedSavedViewRows.value))
const currentViewIsFavoritable = computed(() => currentView.value !== 'search')
const favoriteViewNavItems = computed<FavoriteViewNavItem[]>(() => favoriteViews.value.map(view => ({
  id: view.id,
  label: deriveViewLabel(view.id),
})))

function customViewBelongsInCurrentViewsDirectory(view: CustomView): boolean {
  const kind = getCustomViewKind(view.contextKey)
  if (kind === null) {
    return false
  }

  if ((activeViewsDirectoryTab.value === 'project-views') !== (kind === 'projects')) {
    return false
  }

  const activeTeamKey = currentTeamKey.value
  const viewTeamKey = getCustomViewTeamKey(view.contextKey)
  return activeTeamKey ? viewTeamKey === activeTeamKey : viewTeamKey === null
}

function getCustomViewKind(contextKey: string): CustomViewKind | null {
  if (contextKey === 'my-issues') {
    return 'issues'
  }

  if (contextKey === 'projects') {
    return 'projects'
  }

  const [scope, , section] = contextKey.split(':')
  if (scope !== 'team') {
    return null
  }

  if (section === 'issues') {
    return 'issues'
  }

  if (section === 'projects') {
    return 'projects'
  }

  return null
}

function getCustomViewTeamKey(contextKey: string): string | null {
  const [scope, key] = contextKey.split(':')
  return scope === 'team' && key ? key : null
}

function customViewToSavedViewRow(view: CustomView): SavedViewRow {
  const kind = getCustomViewKind(view.contextKey)
  const stats = getCustomViewStats(view)

  return {
    id: view.id,
    name: view.name,
    description: view.description,
    category: kind === 'projects' ? 'Projects' : 'Issues',
    owner: currentUserName.value || 'Me',
    count: stats.count,
    updatedAt: stats.updatedAt,
    icon: kind === 'projects' ? '◈' : '▱',
    viewId: view.id,
  }
}

function getCustomViewStats(view: CustomView): { count: number, updatedAt?: string } {
  const filters = customViewFiltersToClauses(view.filters)
  const kind = getCustomViewKind(view.contextKey)

  if (kind === 'projects') {
    const projects = getProjectRowsForCustomView(view.contextKey)
      .filter(project => filterGroupsMatch(project, filters, projectMatchesFilter))
    const updatedAt = [...projects]
      .sort((left, right) => getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt))[0]?.updatedAt

    return {
      count: projects.length,
      updatedAt,
    }
  }

  const tickets = getIssueTicketsForCustomView(view.contextKey)
    .filter(ticket => filterGroupsMatch(ticket, filters, ticketMatchesFilter))

  return {
    count: tickets.length,
    updatedAt: sortTicketsByActivity(tickets)[0]?.updatedAt,
  }
}

function getIssueTicketsForCustomView(contextKey: string): JiraTicket[] {
  if (contextKey === 'my-issues') {
    return issueTickets.value
  }

  const teamKey = getCustomViewTeamKey(contextKey)
  if (teamKey) {
    return issueTickets.value.filter(ticket => ticket.spaceKey === teamKey)
  }

  return issueTickets.value
}

function getProjectRowsForCustomView(contextKey: string): ProjectRow[] {
  const teamKey = getCustomViewTeamKey(contextKey)
  if (teamKey) {
    return projectRows.value.filter(project => project.spaceKey === teamKey)
  }

  return projectRows.value
}

function isFilterFieldId(value: string): value is FilterFieldId {
  return filterFieldIds.has(value)
}

function hasKnownFilterFieldId(filter: FavoriteViewFilter): filter is FavoriteViewFilter & { fieldId: FilterFieldId } {
  return isFilterFieldId(filter.fieldId)
}

function getTeamSectionLabel(section: string | undefined): string {
  if (section === 'triage') return 'Backlog'
  if (section === 'all') return 'All issues'
  if (section === 'backlog') return 'Backlog'
  if (section === 'projects') return 'Projects'
  if (section === 'views') return 'Views'
  if (section === 'project-views') return 'Views · Projects'
  if (section === 'ready-qa') return 'Ready for QA'
  return 'Active'
}

function deriveViewLabel(viewId: string): string {
  const customView = getCustomView(viewId)
  if (customView) return customView.name

  if (viewId === 'inbox') return 'Inbox'
  if (viewId === 'my-issues') return 'My issues · Assigned'
  if (viewId === 'my-created') return 'My issues · Created'
  if (viewId === 'initiatives') return 'Initiatives'
  if (viewId === 'projects') return 'Projects'
  if (viewId === 'views') return 'Views · Issues'
  if (viewId === 'project-views') return 'Views · Projects'
  if (viewId === 'ready-qa') return 'Ready for QA'

  const [scope, key, section] = viewId.split(':')
  if (scope === 'team' && key) {
    const teamName = enabledSpaces.value.find(space => space.key === key)?.name || key
    return `${teamName} · ${getTeamSectionLabel(section)}`
  }

  const savedView = savedViewRows.value.find(row => row.viewId === viewId)
  return savedView?.name ?? viewId
}

function getCurrentFavoriteViewFilters(): FavoriteViewFilter[] {
  return currentViewFilters.value.map(filter => ({
    id: filter.id,
    fieldId: filter.fieldId,
    fieldLabel: filter.fieldLabel,
    value: filter.value,
    valueLabel: filter.valueLabel,
  }))
}

function toViewFilterClauses(filters: FavoriteViewFilter[]): ViewFilterClause[] {
  return filters
    .filter(hasKnownFilterFieldId)
    .map(filter => ({
      id: filter.id,
      fieldId: filter.fieldId,
      fieldLabel: filter.fieldLabel,
      value: filter.value,
      valueLabel: filter.valueLabel,
    }))
}

function restoreFavoriteViewFilters(viewId: string) {
  const favoriteView = getFavoriteView(viewId)
  if (!favoriteView) return

  savedViewFilters.value = {
    ...savedViewFilters.value,
    [viewId]: toViewFilterClauses(favoriteView.filters),
  }
}

function toggleCurrentViewFavorite() {
  if (!currentViewIsFavoritable.value) return
  toggleFavoriteView(currentView.value, getCurrentFavoriteViewFilters())
}

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
      id: `team:${space.key}:backlog`,
      label: `${space.name || space.key} backlog`,
      description: `Open backlog for ${space.key}`,
      section: 'Teams',
      icon: space.key.slice(0, 1).toUpperCase(),
      execute: () => handleViewChange(`team:${space.key}:backlog`),
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
      icon: 'search',
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
    closeFilterMenu()
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

  if (!focusedIssueKey.value || !flatTickets.some(ticket => getDisplayedIssueRowKey(ticket) === focusedIssueKey.value)) {
    focusedIssueKey.value = flatTickets[0] ? getDisplayedIssueRowKey(flatTickets[0]) : null
  }

  if (selectionAnchorKey.value && !flatTickets.some(ticket => getDisplayedIssueRowKey(ticket) === selectionAnchorKey.value)) {
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
  getLabels: (ticket: JiraTicket) => string[],
  getRank: (label: string) => number,
): IssueSection[] {
  const groups = new Map<string, JiraTicket[]>()
  for (const ticket of nextTickets) {
    for (const label of getLabels(ticket)) {
      groups.set(label, [...groups.get(label) ?? [], ticket])
    }
  }

  return [...groups.entries()]
    .sort((left, right) => compareIssueGroupEntries(left, right, getRank))
    .map(([label, sectionTickets]) => ({
      id: label,
      label,
      tickets: sortTickets(sectionTickets),
    }))
}

function compareIssueGroupEntries(
  left: [string, JiraTicket[]],
  right: [string, JiraTicket[]],
  getRank: (label: string) => number,
): number {
  const manualOrder = issueGroupOrders.value[listGrouping.value] ?? []
  const leftManualIndex = manualOrder.indexOf(left[0])
  const rightManualIndex = manualOrder.indexOf(right[0])

  if (leftManualIndex !== -1 || rightManualIndex !== -1) {
    if (leftManualIndex === -1) return 1
    if (rightManualIndex === -1) return -1
    return leftManualIndex - rightManualIndex
  }

  return listGroupingDirection.value === 'desc'
    ? getRank(right[0]) - getRank(left[0]) || right[0].localeCompare(left[0])
    : getRank(left[0]) - getRank(right[0]) || left[0].localeCompare(right[0])
}

function getIssueGroupingLabels(ticket: JiraTicket, fieldId: IssueGroupingFieldId): string[] {
  if (fieldId === 'status') return [ticket.status || 'No status']
  if (fieldId === 'assignee') return [ticket.assignee || 'Unassigned']
  if (fieldId === 'agent') return ['No agent']
  if (fieldId === 'project') return [ticket.parent?.summary ?? 'No project']
  if (fieldId === 'priority') return [ticket.priority || 'No priority']
  if (fieldId === 'label') {
    const labels = getTicketLabels(ticket)
    return labels.length > 0 ? labels : ['No labels']
  }
  return ['All issues']
}

function getTicketLabels(ticket: JiraTicket): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const label of ticket.labels ?? []) {
    const trimmed = label.trim()
    const normalized = normalizeFilterValue(trimmed)
    if (!trimmed || seen.has(normalized)) continue
    seen.add(normalized)
    labels.push(trimmed)
  }
  return labels
}

function getIssueGroupingRank(label: string, fieldId: IssueGroupingFieldId): number {
  if (fieldId === 'priority') return getPriorityRank(label)
  if (fieldId === 'status') return 0
  return 0
}

function sortTickets(nextTickets: JiraTicket[]): JiraTicket[] {
  const direction = listOrderingDirection.value === 'desc' ? -1 : 1
  return [...nextTickets].sort((left, right) => {
    if (listOrdering.value === 'updated') {
      return direction * (getTimeValue(right.updatedAt ?? right.createdAt) - getTimeValue(left.updatedAt ?? left.createdAt))
        || getPriorityRank(left.priority) - getPriorityRank(right.priority)
        || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'created') {
      return direction * (getTimeValue(right.createdAt) - getTimeValue(left.createdAt))
        || getPriorityRank(left.priority) - getPriorityRank(right.priority)
        || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'due') {
      return direction * (getTimeValue(left.dueDate) - getTimeValue(right.dueDate))
        || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'title') {
      return direction * left.summary.localeCompare(right.summary)
        || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'assignee') {
      return direction * (left.assignee || 'Unassigned').localeCompare(right.assignee || 'Unassigned')
        || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'agent' || listOrdering.value === 'estimate' || listOrdering.value === 'linkCount' || listOrdering.value === 'timeInStatus') {
      return left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'priority') {
      return direction * (getPriorityRank(left.priority) - getPriorityRank(right.priority))
        || getStatusRank(left.statusCategory) - getStatusRank(right.statusCategory)
        || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
    }

    if (listOrdering.value === 'manual') {
      return 0
    }

    return direction * (getStatusRank(left.statusCategory) - getStatusRank(right.statusCategory))
      || getPriorityRank(left.priority) - getPriorityRank(right.priority)
      || left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function filterTicketsForCurrentView(nextTickets: JiraTicket[]): JiraTicket[] {
  return nextTickets.filter(ticket => (
    isTicketInCurrentTeamSection(ticket)
    && isCompletedIssueVisible(ticket)
    && isSubIssueVisible(ticket)
    && isBacklogIssueVisible(ticket)
  ))
}

function isTicketInCurrentTeamSection(ticket: JiraTicket): boolean {
  const section = currentTeamSection.value
  if (section === null) return true
  if (section === 'active' || !section) return true
  if (section === 'triage') return isBacklogIssueTicket(ticket)
  if (section === 'backlog') return isBacklogIssueTicket(ticket)
  return true
}

function isBacklogIssueTicket(ticket: JiraTicket): boolean {
  return ticket.status.trim().toLowerCase() === 'backlog'
}

function isActiveIssueTicket(ticket: JiraTicket): boolean {
  return getStatusGroup(ticket.statusCategory) !== 'done'
}

function isCompletedIssueVisible(ticket: JiraTicket): boolean {
  if (getStatusGroup(ticket.statusCategory) !== 'done') return true
  return isDateVisibleInRange(completedRange.value, ticket.completedAt ?? ticket.updatedAt)
}

function isSubIssueTicket(ticket: JiraTicket): boolean {
  const parentIssueType = ticket.parent?.issueType.trim().toLowerCase()
  return Boolean(parentIssueType && !parentIssueType.includes('epic'))
}

function getDisplayedIssueRowKey(ticket: JiraTicket): string {
  return ticket.key
}

function hideSubIssuesWithVisibleParents(nextTickets: JiraTicket[]): JiraTicket[] {
  const visibleTicketKeys = new Set(nextTickets.map(ticket => ticket.key))
  return nextTickets.filter(ticket => !isSubIssueTicket(ticket) || !ticket.parent?.key || !visibleTicketKeys.has(ticket.parent.key))
}

function isSubIssueVisible(ticket: JiraTicket): boolean {
  if (!isSubIssueTicket(ticket)) return true
  return isDateVisibleInRange(showSubIssuesRange.value, ticket.createdAt ?? ticket.updatedAt)
}

function isBacklogIssueVisible(ticket: JiraTicket): boolean {
  if (!isBacklogIssueTicket(ticket)) return true
  return isDateVisibleInRange(showTriageIssuesRange.value, ticket.createdAt ?? ticket.updatedAt)
}

function isDateVisibleInRange(range: IssueVisibilityRange, dateValue: string | undefined): boolean {
  if (range === 'all') return true
  if (range === 'hidden') return false

  const timeValue = getTimeValue(dateValue)
  if (timeValue === 0) return false

  const rangeMs = range === 'day'
    ? 24 * 60 * 60 * 1000
    : range === 'week'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000
  return Date.now() - timeValue <= rangeMs
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
    ...getTicketLabels(ticket),
  ].some(value => value?.toLowerCase().includes(query))
}

function getFilterFieldLabel(fieldId: FilterFieldId): string {
  if (fieldId === 'status') return 'Status'
  if (fieldId === 'assignee') return 'Assignee'
  if (fieldId === 'reporter') return 'Creator'
  if (fieldId === 'priority') return 'Priority'
  if (fieldId === 'labels') return 'Labels'
  if (fieldId === 'suggestedLabel') return 'Suggested label'
  if (fieldId === 'dueDate') return 'Due date'
  if (fieldId === 'createdDate') return 'Created date'
  if (fieldId === 'updatedDate') return 'Updated date'
  if (fieldId === 'completedDate') return 'Completed date'
  if (fieldId === 'project') return 'Project'
  if (fieldId === 'projectStatus') return 'Project status'
  if (fieldId === 'projectPriority') return 'Project priority'
  if (fieldId === 'projectLead') return 'Project lead'
  if (fieldId === 'initiative') return 'Initiative'
  if (fieldId === 'subscribers') return 'Subscribers'
  if (fieldId === 'shared') return 'Shared'
  if (fieldId === 'sharedWith') return 'Shared with'
  return 'External source'
}

function getActiveFilterContext(): FilterContextKind {
  if (isProjectDisplayView.value) return 'projects'
  if (currentView.value === 'initiatives') return 'initiatives'
  if (isViewsDirectory.value) return 'views'
  return 'issues'
}

function getFilterOptions(fieldId: FilterFieldId): FilterOption[] {
  const context = getActiveFilterContext()
  if (context === 'projects') return getProjectFilterOptions(fieldId)
  if (context === 'initiatives') return getInitiativeFilterOptions(fieldId)
  if (context === 'views') return getSavedViewFilterOptions(fieldId)
  return getIssueFilterOptions(fieldId)
}

function getIssueFilterOptions(fieldId: FilterFieldId): FilterOption[] {
  const baseTickets = filterableTickets.value
  if (fieldId === 'status') {
    return countFilterOptions(baseTickets.map(ticket => ({
      value: normalizeFilterValue(ticket.status || 'No status'),
      label: ticket.status || 'No status',
      icon: '◌',
    })))
  }

  if (fieldId === 'assignee' || fieldId === 'sharedWith') {
    const currentUser = currentUserName.value || 'Current user'
    const people = baseTickets.map(ticket => ({
      value: normalizeFilterValue(ticket.assignee || 'Unassigned'),
      label: ticket.assignee || 'Unassigned',
      icon: '♙',
    }))
    return countFilterOptions([
      {
        value: 'current-user',
        label: 'Current user',
        icon: '♙',
      },
      ...people,
    ]).map(option => (
      option.value === 'current-user'
        ? {
            ...option,
            count: currentUserName.value
              ? baseTickets.filter(ticket => normalizeFilterValue(ticket.assignee) === normalizeFilterValue(currentUser)).length
              : 0,
          }
        : option
    )).filter(option => option.count > 0)
  }

  if (fieldId === 'reporter') {
    const people = baseTickets.map(ticket => ({
      value: normalizeFilterValue(ticket.reporter || 'Unknown'),
      label: ticket.reporter || 'Unknown',
      icon: '♙',
    }))
    return countFilterOptions([
      {
        value: 'current-user',
        label: 'Current user',
        icon: '♙',
      },
      ...people,
    ]).map(option => (
      option.value === 'current-user'
        ? {
            ...option,
            count: baseTickets.filter(ticket => ticketMatchesCurrentUserReporter(ticket)).length,
          }
        : option
    )).filter(option => option.count > 0)
  }

  if (fieldId === 'priority') {
    return countFilterOptions(baseTickets.map(ticket => ({
      value: normalizeFilterValue(ticket.priority || 'No priority'),
      label: ticket.priority || 'No priority',
      icon: '▥',
    })))
  }

  if (fieldId === 'labels' || fieldId === 'suggestedLabel') {
    return countFilterOptions(baseTickets.flatMap(ticket => {
      const labels = getTicketLabels(ticket)
      if (labels.length === 0) {
        return [{ value: normalizeFilterValue('No labels'), label: 'No labels', icon: '▭' }]
      }
      return labels.map(label => ({
        value: normalizeFilterValue(label),
        label,
        icon: '▭',
      }))
    }))
  }

  if (fieldId === 'project') {
    return countFilterOptions(baseTickets.map(ticket => {
      const projectKey = getProjectKey(ticket)
      const project = projectKey ? projectRows.value.find(row => row.key === projectKey) : null
      return {
        value: projectKey ?? 'no-project',
        label: project?.name ?? projectKey ?? 'No project',
        icon: '◇',
      }
    }))
  }

  if (fieldId === 'projectStatus') {
    return countFilterOptions(baseDisplayedProjectRows.value.map(project => ({
      value: normalizeFilterValue(project.status || 'No status'),
      label: project.status || 'No status',
      icon: '◌',
    })))
  }

  if (fieldId === 'projectPriority') {
    return countFilterOptions(baseDisplayedProjectRows.value.map(project => ({
      value: normalizeFilterValue(project.priority || 'No priority'),
      label: project.priority || 'No priority',
      icon: '▥',
    })))
  }

  if (fieldId === 'projectLead') {
    return countFilterOptions(baseDisplayedProjectRows.value.map(project => ({
      value: normalizeFilterValue(project.lead || 'Unassigned'),
      label: project.lead || 'Unassigned',
      icon: '♙',
    })))
  }

  if (fieldId === 'initiative') {
    return countFilterOptions(baseInitiativeRows.value.map(initiative => ({
      value: initiative.id,
      label: initiative.name,
      icon: '◒',
    })))
  }

  if (fieldId === 'subscribers') {
    return countFilterOptions(baseTickets.map(ticket => ({
      value: ticket.isWatching ? 'watching' : 'not-watching',
      label: ticket.isWatching ? 'Watching' : 'Not watching',
      icon: '♧',
    })))
  }

  if (fieldId === 'shared') {
    return [{
      value: 'shared',
      label: 'Shared',
      count: baseTickets.filter(ticket => (ticket.watchCount ?? 0) > 0).length,
      icon: '♢',
    }]
  }

  if (fieldId === 'externalSource') {
    return countFilterOptions(baseTickets.map(ticket => ({
      value: isLocalTicketKey(ticket.key) ? 'local' : 'jira',
      label: isLocalTicketKey(ticket.key) ? 'Local' : 'Jira',
      icon: '◇',
    })))
  }

  return []
}

function getProjectFilterOptions(fieldId: FilterFieldId): FilterOption[] {
  const baseProjects = baseDisplayedProjectRows.value
  if (fieldId === 'status' || fieldId === 'projectStatus') {
    return countFilterOptions(baseProjects.map(project => ({
      value: normalizeFilterValue(project.status || 'No status'),
      label: project.status || 'No status',
      icon: '◌',
    })))
  }

  if (fieldId === 'assignee' || fieldId === 'projectLead' || fieldId === 'sharedWith') {
    const currentUser = currentUserName.value || 'Current user'
    const people = baseProjects.map(project => ({
      value: normalizeFilterValue(project.lead || 'Unassigned'),
      label: project.lead || 'Unassigned',
      icon: '♙',
    }))
    return countFilterOptions([
      {
        value: 'current-user',
        label: 'Current user',
        icon: '♙',
      },
      ...people,
    ]).map(option => (
      option.value === 'current-user'
        ? {
            ...option,
            count: currentUserName.value
              ? baseProjects.filter(project => normalizeFilterValue(project.lead) === normalizeFilterValue(currentUser)).length
              : 0,
          }
        : option
    )).filter(option => option.count > 0)
  }

  if (fieldId === 'priority' || fieldId === 'projectPriority') {
    return countFilterOptions(baseProjects.map(project => ({
      value: normalizeFilterValue(project.priority || 'No priority'),
      label: project.priority || 'No priority',
      icon: '▥',
    })))
  }

  if (fieldId === 'labels' || fieldId === 'suggestedLabel') {
    return countFilterOptions(baseProjects.map(project => ({
      value: normalizeFilterValue(project.health),
      label: project.health,
      icon: project.health === 'Completed' ? '✓' : project.health === 'At risk' ? '◆' : '○',
    })))
  }

  if (fieldId === 'project') {
    return countFilterOptions(baseProjects.map(project => ({
      value: project.key,
      label: project.name,
      icon: '◇',
    })))
  }

  if (fieldId === 'initiative') {
    return countFilterOptions(baseInitiativeRows.value.map(initiative => ({
      value: initiative.id,
      label: initiative.name,
      icon: '◒',
    }))).map(option => ({
      ...option,
      count: baseProjects.filter(project => (
        baseInitiativeRows.value.some(initiative => initiative.id === option.value && initiative.health === project.health)
      )).length,
    })).filter(option => option.count > 0)
  }

  if (fieldId === 'externalSource') {
    return [{
      value: 'jira',
      label: 'Jira',
      count: baseProjects.length,
      icon: '◇',
    }]
  }

  return []
}

function getInitiativeFilterOptions(fieldId: FilterFieldId): FilterOption[] {
  const baseInitiatives = baseInitiativeRows.value
  if (fieldId === 'status' || fieldId === 'labels' || fieldId === 'suggestedLabel') {
    return countFilterOptions(baseInitiatives.map(initiative => ({
      value: normalizeFilterValue(initiative.health),
      label: initiative.health,
      icon: initiative.health === 'Completed' ? '✓' : initiative.health === 'At risk' ? '◆' : '○',
    })))
  }

  if (fieldId === 'assignee' || fieldId === 'projectLead' || fieldId === 'sharedWith') {
    return countFilterOptions(baseInitiatives.map(initiative => ({
      value: normalizeFilterValue(initiative.lead || 'Unassigned'),
      label: initiative.lead || 'Unassigned',
      icon: '♙',
    })))
  }

  if (fieldId === 'initiative') {
    return countFilterOptions(baseInitiatives.map(initiative => ({
      value: initiative.id,
      label: initiative.name,
      icon: '◒',
    })))
  }

  if (fieldId === 'externalSource') {
    return [{
      value: 'jira',
      label: 'Jira',
      count: baseInitiatives.length,
      icon: '◇',
    }]
  }

  return []
}

function getSavedViewFilterOptions(fieldId: FilterFieldId): FilterOption[] {
  const baseViews = baseDisplayedSavedViewRows.value
  if (fieldId === 'assignee' || fieldId === 'sharedWith') {
    return countFilterOptions(baseViews.map(row => ({
      value: normalizeFilterValue(row.owner),
      label: row.owner,
      icon: '♙',
    })))
  }

  if (fieldId === 'labels' || fieldId === 'suggestedLabel' || fieldId === 'project') {
    return countFilterOptions(baseViews.map(row => ({
      value: normalizeFilterValue(row.category),
      label: row.category,
      icon: row.icon,
    })))
  }

  if (fieldId === 'externalSource') {
    return [{
      value: 'jira',
      label: 'Jira',
      count: baseViews.length,
      icon: '◇',
    }]
  }

  return []
}

function getIssueVisibilityRangeLabel(range: IssueVisibilityRange): string {
  return issueVisibilityRangeOptions.find(option => option.id === range)?.label ?? range
}

function countFilterOptions(entries: Array<{ value: string, label: string, icon: string }>): FilterOption[] {
  const optionMap = new Map<string, FilterOption>()
  for (const entry of entries) {
    const existing = optionMap.get(entry.value)
    optionMap.set(entry.value, {
      value: entry.value,
      label: existing?.label ?? entry.label,
      icon: existing?.icon ?? entry.icon,
      count: (existing?.count ?? 0) + 1,
    })
  }

  return [...optionMap.values()]
    .filter(option => option.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function getDateFilterOptions(fieldId: DateFilterFieldId): DateFilterOption[] {
  const context = getActiveFilterContext()
  const options: Array<{ value: DateFilterOperator, label: string }> = [
    { value: 'hasDate', label: 'Is set' },
    { value: 'noDate', label: 'Is not set' },
    { value: 'past', label: 'Before today' },
    { value: 'today', label: 'Today' },
    { value: 'next7', label: 'Next 7 days' },
    { value: 'next30', label: 'Next 30 days' },
  ]

  return options.map(option => ({
    ...option,
    count: getDateFilterOptionCount(context, fieldId, option.value),
  }))
}

function getDateFilterOptionCount(context: FilterContextKind, fieldId: DateFilterFieldId, operator: DateFilterOperator): number {
  if (context === 'projects') {
    return baseDisplayedProjectRows.value.filter(project => (
      dateMatchesOperator(getProjectDateValue(project, fieldId), operator)
    )).length
  }

  if (context === 'initiatives') {
    return baseInitiativeRows.value.filter(initiative => (
      dateMatchesOperator(getInitiativeDateValue(initiative, fieldId), operator)
    )).length
  }

  if (context === 'views') {
    return baseDisplayedSavedViewRows.value.filter(row => (
      dateMatchesOperator(getSavedViewDateValue(row, fieldId), operator)
    )).length
  }

  return filterableTickets.value.filter(ticket => (
    dateMatchesOperator(getTicketDateValue(ticket, fieldId), operator)
  )).length
}

function normalizeFilterValue(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized || 'none'
}

function ticketMatchesCurrentUserReporter(ticket: JiraTicket): boolean {
  if (isLocalTicketKey(ticket.key)) {
    return true
  }

  return Boolean(currentUserName.value)
    && normalizeFilterValue(ticket.reporter) === normalizeFilterValue(currentUserName.value)
}

function getTicketDateValue(ticket: JiraTicket, fieldId: DateFilterFieldId): string | undefined {
  if (fieldId === 'dueDate') return ticket.dueDate
  if (fieldId === 'createdDate') return ticket.createdAt
  if (fieldId === 'updatedDate') return ticket.updatedAt
  return ticket.completedAt
}

function getProjectDateValue(project: ProjectRow, fieldId: DateFilterFieldId): string | undefined {
  if (fieldId === 'dueDate') return project.targetDateValue
  if (fieldId === 'updatedDate') return project.updatedAt
  return undefined
}

function getInitiativeDateValue(initiative: InitiativeRow, fieldId: DateFilterFieldId): string | undefined {
  if (fieldId === 'updatedDate') return initiative.updatedAt
  return undefined
}

function getSavedViewDateValue(row: SavedViewRow, fieldId: DateFilterFieldId): string | undefined {
  if (fieldId === 'updatedDate') return row.updatedAt
  return undefined
}

function dateMatchesOperator(value: string | undefined, operator: DateFilterOperator): boolean {
  const time = getTimeValue(value)
  if (operator === 'hasDate') return time > 0
  if (operator === 'noDate') return time === 0
  if (time === 0) return false

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000
  if (operator === 'past') return time < startOfToday
  if (operator === 'today') return time >= startOfToday && time < startOfTomorrow
  const maxDays = operator === 'next7' ? 7 : 30
  return time >= startOfToday && time < startOfToday + maxDays * 24 * 60 * 60 * 1000
}

function applyViewFiltersToTickets(nextTickets: JiraTicket[]): JiraTicket[] {
  const filters = currentViewFilters.value
  if (!filters.length) return nextTickets
  return nextTickets.filter(ticket => filterGroupsMatch(ticket, filters, ticketMatchesFilter))
}

function ticketMatchesFilter(ticket: JiraTicket, filter: ViewFilterClause): boolean {
  if (filter.fieldId === 'status') {
    return normalizeFilterValue(ticket.status || 'No status') === filter.value
  }
  if (filter.fieldId === 'assignee' || filter.fieldId === 'sharedWith') {
    if (filter.value === 'current-user') {
      return currentUserName.value
        ? normalizeFilterValue(ticket.assignee) === normalizeFilterValue(currentUserName.value)
        : isActiveIssueTicket(ticket)
    }
    return normalizeFilterValue(ticket.assignee || 'Unassigned') === filter.value
  }
  if (filter.fieldId === 'reporter') {
    if (filter.value === 'current-user') {
      return ticketMatchesCurrentUserReporter(ticket)
    }
    return normalizeFilterValue(ticket.reporter || 'Unknown') === filter.value
  }
  if (filter.fieldId === 'priority') return normalizeFilterValue(ticket.priority || 'No priority') === filter.value
  if (filter.fieldId === 'labels' || filter.fieldId === 'suggestedLabel') {
    const labels = getTicketLabels(ticket)
    if (labels.length === 0) return filter.value === normalizeFilterValue('No labels')
    return labels.some(label => normalizeFilterValue(label) === filter.value)
  }
  if (filter.fieldId === 'project') return (getProjectKey(ticket) ?? 'no-project') === filter.value
  if (filter.fieldId === 'projectStatus' || filter.fieldId === 'projectPriority' || filter.fieldId === 'projectLead') {
    const project = getTicketProject(ticket)
    if (!project) return false
    return projectMatchesFilter(project, filter)
  }
  if (filter.fieldId === 'initiative') return getTicketInitiativeIds(ticket).includes(filter.value)
  if (filter.fieldId === 'subscribers') return filter.value === 'watching' ? ticket.isWatching === true : ticket.isWatching !== true
  if (filter.fieldId === 'shared') return (ticket.watchCount ?? 0) > 0
  if (filter.fieldId === 'externalSource') return filter.value === (isLocalTicketKey(ticket.key) ? 'local' : 'jira')
  return dateMatchesOperator(getTicketDateValue(ticket, filter.fieldId), getDateFilterOperator(filter.value))
}

function getDateFilterOperator(value: string): DateFilterOperator {
  if (value === 'noDate') return 'noDate'
  if (value === 'past') return 'past'
  if (value === 'today') return 'today'
  if (value === 'next7') return 'next7'
  if (value === 'next30') return 'next30'
  return 'hasDate'
}

function getTicketProject(ticket: JiraTicket): ProjectRow | null {
  const projectKey = getProjectKey(ticket)
  if (!projectKey) return null
  return projectRows.value.find(project => project.key === projectKey) ?? null
}

function getTicketInitiativeIds(ticket: JiraTicket): string[] {
  const project = getTicketProject(ticket)
  if (!project) return []
  return baseInitiativeRows.value
    .filter(initiative => initiative.name === project.health || initiative.health === project.health)
    .map(initiative => initiative.id)
}

function applyViewFiltersToProjects(nextProjects: ProjectRow[]): ProjectRow[] {
  const filters = currentViewFilters.value
  if (!filters.length) return nextProjects
  return nextProjects.filter(project => filterGroupsMatch(project, filters, projectMatchesFilter))
}

function projectMatchesFilter(project: ProjectRow, filter: ViewFilterClause): boolean {
  if (filter.fieldId === 'status' || filter.fieldId === 'projectStatus') return normalizeFilterValue(project.status || 'No status') === filter.value
  if (filter.fieldId === 'assignee' || filter.fieldId === 'projectLead' || filter.fieldId === 'sharedWith') return normalizeFilterValue(project.lead || 'Unassigned') === filter.value
  if (filter.fieldId === 'priority' || filter.fieldId === 'projectPriority') return normalizeFilterValue(project.priority || 'No priority') === filter.value
  if (filter.fieldId === 'labels' || filter.fieldId === 'suggestedLabel') return normalizeFilterValue(project.health) === filter.value
  if (filter.fieldId === 'project') return project.key === filter.value
  if (filter.fieldId === 'initiative') return baseInitiativeRows.value.some(initiative => initiative.id === filter.value && initiative.health === project.health)
  if (filter.fieldId === 'externalSource') return filter.value === 'jira'
  if (filter.fieldId === 'subscribers' || filter.fieldId === 'shared') return true
  if (filter.fieldId === 'dueDate' || filter.fieldId === 'createdDate' || filter.fieldId === 'updatedDate' || filter.fieldId === 'completedDate') {
    return dateMatchesOperator(getProjectDateValue(project, filter.fieldId), getDateFilterOperator(filter.value))
  }
  return false
}

function applyProjectClosedRange(projects: ProjectRow[]): ProjectRow[] {
  if (projectClosedRange.value === 'all') return projects
  return projects.filter(project => project.health !== 'Completed')
}

function sortProjectsByOrdering(projects: ProjectRow[]): ProjectRow[] {
  if (projectOrdering.value === 'manual') {
    return projects
  }

  return [...projects].sort((left, right) => compareProjects(left, right, projectOrdering.value))
}

function compareProjects(left: ProjectRow, right: ProjectRow, ordering: ProjectOrderingFieldId): number {
  if (ordering === 'name') return left.name.localeCompare(right.name)
  if (ordering === 'health') return getProjectHealthRank(left.health) - getProjectHealthRank(right.health)
  if (ordering === 'priority') return getPriorityRank(left.priority) - getPriorityRank(right.priority)
  if (ordering === 'lead') return left.lead.localeCompare(right.lead)
  if (ordering === 'targetDate') return compareOptionalDates(left.targetDateValue, right.targetDateValue)
  if (ordering === 'updated') return getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt)
  if (ordering === 'progress') return right.progress - left.progress
  return 0
}

function compareOptionalDates(left: string | undefined, right: string | undefined): number {
  const leftTime = getTimeValue(left)
  const rightTime = getTimeValue(right)
  if (leftTime === 0 && rightTime === 0) return 0
  if (leftTime === 0) return 1
  if (rightTime === 0) return -1
  return leftTime - rightTime
}

function groupProjects(projects: ProjectRow[], grouping: ProjectGroupingFieldId): ProjectSection[] {
  const groups = new Map<string, ProjectRow[]>()

  for (const project of projects) {
    const label = getProjectGroupingLabel(project, grouping)
    groups.set(label, [...(groups.get(label) ?? []), project])
  }

  return [...groups.entries()]
    .map(([label, groupProjects]) => ({
      id: `${grouping}:${label}`,
      label,
      projects: groupProjects,
    }))
    .sort((left, right) => (
      getProjectGroupingRank(left.label, grouping) - getProjectGroupingRank(right.label, grouping)
      || left.label.localeCompare(right.label)
    ))
}

function getProjectGroupingLabel(project: ProjectRow, grouping: ProjectGroupingFieldId): string {
  if (grouping === 'health') return project.health
  if (grouping === 'status') return project.status || 'No status'
  if (grouping === 'priority') return project.priority || 'No priority'
  if (grouping === 'lead') return project.lead || 'Unassigned'
  return 'Projects'
}

function getProjectGroupingRank(label: string, grouping: ProjectGroupingFieldId): number {
  if (grouping === 'health') {
    if (label === 'At risk') return 0
    if (label === 'On track') return 1
    if (label === 'Completed') return 2
  }

  if (grouping === 'priority') {
    return getPriorityRank(label)
  }

  return 0
}

function applyViewFiltersToInitiatives(nextInitiatives: InitiativeRow[]): InitiativeRow[] {
  const filters = currentViewFilters.value
  if (!filters.length) return nextInitiatives
  return nextInitiatives.filter(initiative => filterGroupsMatch(initiative, filters, initiativeMatchesFilter))
}

function initiativeMatchesFilter(initiative: InitiativeRow, filter: ViewFilterClause): boolean {
  if (filter.fieldId === 'initiative') return initiative.id === filter.value
  if (filter.fieldId === 'shared') return true
  if (filter.fieldId === 'status' || filter.fieldId === 'labels' || filter.fieldId === 'suggestedLabel') return normalizeFilterValue(initiative.health) === filter.value
  if (filter.fieldId === 'assignee' || filter.fieldId === 'projectLead' || filter.fieldId === 'sharedWith') return normalizeFilterValue(initiative.lead || 'Unassigned') === filter.value
  if (filter.fieldId === 'externalSource') return filter.value === 'jira'
  if (filter.fieldId === 'dueDate' || filter.fieldId === 'createdDate' || filter.fieldId === 'updatedDate' || filter.fieldId === 'completedDate') {
    return dateMatchesOperator(getInitiativeDateValue(initiative, filter.fieldId), getDateFilterOperator(filter.value))
  }
  return false
}

function applyViewFiltersToSavedViews(nextViews: SavedViewRow[]): SavedViewRow[] {
  const filters = currentViewFilters.value
  if (!filters.length) return nextViews
  return nextViews.filter(row => filterGroupsMatch(row, filters, savedViewMatchesFilter))
}

function savedViewMatchesFilter(row: SavedViewRow, filter: ViewFilterClause): boolean {
  if (filter.fieldId === 'shared') return true
  if (filter.fieldId === 'assignee' || filter.fieldId === 'sharedWith') return normalizeFilterValue(row.owner) === filter.value
  if (filter.fieldId === 'labels' || filter.fieldId === 'suggestedLabel' || filter.fieldId === 'project') return normalizeFilterValue(row.category) === filter.value || normalizeFilterValue(row.name).includes(filter.value)
  if (filter.fieldId === 'externalSource') return filter.value === 'jira'
  if (filter.fieldId === 'dueDate' || filter.fieldId === 'createdDate' || filter.fieldId === 'updatedDate' || filter.fieldId === 'completedDate') {
    return dateMatchesOperator(getSavedViewDateValue(row, filter.fieldId), getDateFilterOperator(filter.value))
  }
  return false
}

function setActiveCustomViewFilters(filters: ViewFilterClause[]): void {
  const customFilters = clausesToCustomViewFilters(filters)

  if (viewEditorDraft.value && currentView.value === viewEditorDraft.value.id) {
    viewEditorDraft.value = {
      ...viewEditorDraft.value,
      filters: customFilters,
    }
    return
  }

  savedViewFilters.value = {
    ...savedViewFilters.value,
    [currentView.value]: filters,
  }
}

function getFilterClause(fieldId: FilterFieldId, value: string): ViewFilterClause | null {
  return currentViewFilters.value.find(filter => filter.fieldId === fieldId && filter.value === value) ?? null
}

function isFilterClauseSelected(fieldId: FilterFieldId, value: string): boolean {
  return getFilterClause(fieldId, value) !== null
}

function toggleFilterClause(fieldId: FilterFieldId, value: string, valueLabel: string): void {
  if (isFilterClauseSelected(fieldId, value)) {
    setActiveCustomViewFilters(currentViewFilters.value.filter(filter => !(
      filter.fieldId === fieldId && filter.value === value
    )))
    return
  }

  const fieldLabel = getFilterFieldLabel(fieldId)
  const nextFilter: ViewFilterClause = {
    id: `${fieldId}:${value}:${Date.now()}`,
    fieldId,
    fieldLabel,
    value,
    valueLabel,
  }

  setActiveCustomViewFilters([...currentViewFilters.value, nextFilter])
}

function removeFilterClause(filterId: string) {
  if (viewEditorDraft.value && currentView.value === viewEditorDraft.value.id) {
    setActiveCustomViewFilters(currentViewFilters.value.filter(filter => filter.id !== filterId))
    return
  }

  savedViewFilters.value = {
    ...savedViewFilters.value,
    [currentView.value]: currentViewFilters.value.filter(filter => filter.id !== filterId),
  }
}

function removeActiveFilterChip(chip: ActiveFilterChip): void {
  if (chip.kind === 'clause') {
    removeFilterClause(chip.filterId)
    return
  }

  const defaults = getDefaultDisplayForView(currentView.value)
  if (chip.inclusionId === 'completed') {
    completedRange.value = normalizeIssueVisibilityRange(defaults.completedRange)
    return
  }

  if (chip.inclusionId === 'subIssues') {
    showSubIssuesRange.value = normalizeIssueVisibilityRange(defaults.showSubIssuesRange)
    return
  }

  showTriageIssuesRange.value = normalizeIssueVisibilityRange(defaults.showTriageIssuesRange)
}

function clearCurrentViewFilters() {
  if (viewEditorDraft.value && currentView.value === viewEditorDraft.value.id) {
    setActiveCustomViewFilters([])
    resetIssueInclusionFilters()
    return
  }

  const nextFilters = { ...savedViewFilters.value }
  delete nextFilters[currentView.value]
  savedViewFilters.value = nextFilters
  resetIssueInclusionFilters()
}

function resetIssueInclusionFilters(): void {
  const defaults = getDefaultDisplayForView(currentView.value)
  completedRange.value = normalizeIssueVisibilityRange(defaults.completedRange)
  showSubIssuesRange.value = normalizeIssueVisibilityRange(defaults.showSubIssuesRange)
  showTriageIssuesRange.value = normalizeIssueVisibilityRange(defaults.showTriageIssuesRange)

  const currentDisplay = captureDisplay()
  const nextDisplays = { ...savedViewDisplays.value }
  if (viewDisplayMatches(currentDisplay, defaults)) {
    delete nextDisplays[currentView.value]
    savedViewDisplays.value = nextDisplays
  }
}

function openFilterMenu() {
  closeCustomViewContextMenu()
  filterMenuOpen.value = true
  displayOptionsOpen.value = false
}

function closeFilterMenu() {
  filterMenuOpen.value = false
  filterFieldSearchQuery.value = ''
  filterSearchQuery.value = ''
}

function toggleFilterMenu() {
  if (filterMenuOpen.value) {
    closeFilterMenu()
    return
  }
  openFilterMenu()
}

function saveCurrentViewFilters() {
  if (viewEditorDraft.value && currentView.value === viewEditorDraft.value.id) {
    setActiveCustomViewFilters(currentViewFilters.value)
    return
  }

  savedViewFilters.value = {
    ...savedViewFilters.value,
    [currentView.value]: [...currentViewFilters.value],
  }
}

function getIssueTypeIcon(issueType: string): string {
  const subtype = getLinearIssueSubtype(issueType)
  if (subtype === 'Story') return '◇'
  if (subtype === 'Bug') return '◆'
  if (subtype === 'Feature') return '◈'
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

  let currentParent = ticket.parent
  const visitedKeys = new Set<string>()

  while (currentParent?.key && !visitedKeys.has(currentParent.key)) {
    const parentKey = currentParent.key
    visitedKeys.add(parentKey)

    if (isEpicIssueType(currentParent.issueType)) {
      return parentKey
    }

    const parentTicket = enabledTickets.value.find(candidate => candidate.key === parentKey)
    currentParent = parentTicket?.parent
  }

  return null
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

function getIssueGroupMarkerClass(label: string): string {
  const normalizedLabel = label.toLowerCase()
  if (normalizedLabel.includes('qa') || normalizedLabel.includes('deployment') || normalizedLabel.includes('done') || normalizedLabel.includes('complete')) {
    return 'border-[#3aa7ff] bg-[#3aa7ff]/10'
  }
  if (normalizedLabel.includes('progress') || normalizedLabel.includes('review') || normalizedLabel.includes('blocked')) {
    return 'border-[#e59356] bg-[#e59356]/10'
  }
  if (normalizedLabel.includes('todo') || normalizedLabel.includes('backlog') || normalizedLabel.includes('unstarted')) {
    return 'border-[#d7d8dc] bg-transparent'
  }
  return 'border-[#8f9198] bg-transparent'
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

function resetIssueDisplayOptions() {
  const defaults = getDefaultDisplayForView(currentView.value)
  listGrouping.value = normalizeIssueGroupingFieldId(defaults.grouping)
  listSubGrouping.value = normalizeIssueGroupingFieldId(defaults.subGrouping)
  listOrdering.value = normalizeIssueOrderingFieldId(defaults.ordering)
  listGroupingDirection.value = defaults.groupingDirection
  listOrderingDirection.value = defaults.orderingDirection
  orderCompletedByRecency.value = defaults.orderCompletedByRecency
  showEmptyGroups.value = defaults.showEmptyGroups
  issueGroupOrders.value = copyIssueGroupConfigMap(defaults.issueGroupOrders)
  hiddenIssueGroupIds.value = copyIssueGroupConfigMap(defaults.hiddenIssueGroupIds)
  collapsedIssueSectionIds.value = [...defaults.collapsedIssueSectionIds]
  visibleIssueRowFields.value = normalizeIssueRowFields(defaults.visibleIssueRowFields)

  const nextDisplays = { ...savedViewDisplays.value }
  delete nextDisplays[currentView.value]
  savedViewDisplays.value = nextDisplays
}

function resetProjectDisplayOptions() {
  projectGrouping.value = 'none'
  projectOrdering.value = 'manual'
  projectClosedRange.value = 'all'
  collapsedProjectSectionIds.value = []
  visibleProjectRowFields.value = normalizeProjectRowFields(getDefaultViewDisplay().visibleProjectRowFields)

  const nextDisplays = { ...savedViewDisplays.value }
  delete nextDisplays[currentView.value]
  savedViewDisplays.value = nextDisplays
}

function openGroupOrdering() {
  groupOrderingOpen.value = true
}

function closeGroupOrdering() {
  groupOrderingOpen.value = false
}

function getCurrentIssueGroupOrder(): string[] {
  return issueGroupOrders.value[listGrouping.value] ?? []
}

function setCurrentIssueGroupOrder(groupIds: string[]) {
  issueGroupOrders.value = {
    ...issueGroupOrders.value,
    [listGrouping.value]: groupIds,
  }
}

function getCurrentHiddenIssueGroupIds(): string[] {
  return hiddenIssueGroupIds.value[listGrouping.value] ?? []
}

function setCurrentHiddenIssueGroupIds(groupIds: string[]) {
  hiddenIssueGroupIds.value = {
    ...hiddenIssueGroupIds.value,
    [listGrouping.value]: groupIds,
  }
}

function isIssueGroupHidden(groupId: string): boolean {
  return getCurrentHiddenIssueGroupIds().includes(groupId)
}

function toggleIssueGroupVisibility(groupId: string) {
  const hiddenIds = getCurrentHiddenIssueGroupIds()
  setCurrentHiddenIssueGroupIds(
    hiddenIds.includes(groupId)
      ? hiddenIds.filter(id => id !== groupId)
      : [...hiddenIds, groupId],
  )
}

function resetCurrentIssueGroupOrdering() {
  listGroupingDirection.value = 'asc'
  setCurrentIssueGroupOrder([])
  setCurrentHiddenIssueGroupIds([])
}

function startIssueGroupDrag(groupId: string) {
  draggedIssueGroupId.value = groupId
}

function finishIssueGroupDrag() {
  draggedIssueGroupId.value = null
}

function dropIssueGroup(targetGroupId: string) {
  const draggedGroupId = draggedIssueGroupId.value
  if (!draggedGroupId || draggedGroupId === targetGroupId) {
    finishIssueGroupDrag()
    return
  }

  const currentIds = issueGroupOrderingRows.value.map(row => row.id)
  const nextIds = currentIds.filter(id => id !== draggedGroupId)
  const targetIndex = nextIds.indexOf(targetGroupId)

  if (targetIndex === -1) {
    finishIssueGroupDrag()
    return
  }

  nextIds.splice(targetIndex, 0, draggedGroupId)
  setCurrentIssueGroupOrder(nextIds)
  finishIssueGroupDrag()
}

function toggleOrderingDirection() {
  listOrderingDirection.value = listOrderingDirection.value === 'asc' ? 'desc' : 'asc'
}

function isProjectRowFieldVisible(fieldId: ProjectRowFieldId): boolean {
  return visibleProjectRowFields.value.includes(fieldId)
}

function toggleProjectRowField(fieldId: ProjectRowFieldId) {
  if (isProjectRowFieldVisible(fieldId)) {
    if (visibleProjectRowFields.value.length === 1) return
    visibleProjectRowFields.value = visibleProjectRowFields.value.filter(item => item !== fieldId)
    return
  }

  visibleProjectRowFields.value = [...visibleProjectRowFields.value, fieldId]
}

function isInitiativeRowFieldVisible(fieldId: InitiativeRowFieldId): boolean {
  return visibleInitiativeRowFields.value.includes(fieldId)
}

function toggleInitiativeRowField(fieldId: InitiativeRowFieldId) {
  if (isInitiativeRowFieldVisible(fieldId)) {
    if (visibleInitiativeRowFields.value.length === 1) return
    visibleInitiativeRowFields.value = visibleInitiativeRowFields.value.filter(item => item !== fieldId)
    return
  }

  visibleInitiativeRowFields.value = [...visibleInitiativeRowFields.value, fieldId]
}

function isSavedViewRowFieldVisible(fieldId: SavedViewRowFieldId): boolean {
  return visibleSavedViewRowFields.value.includes(fieldId)
}

function toggleSavedViewRowField(fieldId: SavedViewRowFieldId) {
  if (isSavedViewRowFieldVisible(fieldId)) {
    if (visibleSavedViewRowFields.value.length === 1) return
    visibleSavedViewRowFields.value = visibleSavedViewRowFields.value.filter(item => item !== fieldId)
    return
  }

  visibleSavedViewRowFields.value = [...visibleSavedViewRowFields.value, fieldId]
}

function getProjectGridTemplate(): string {
  const columns = ['minmax(220px,1.4fr)']
  if (isProjectRowFieldVisible('health')) columns.push('108px')
  if (isProjectRowFieldVisible('priority')) columns.push('94px')
  if (isProjectRowFieldVisible('lead')) columns.push('130px')
  if (isProjectRowFieldVisible('targetDate')) columns.push('104px')
  if (isProjectRowFieldVisible('issues')) columns.push('150px')
  if (isProjectRowFieldVisible('status')) columns.push('116px')
  return columns.join(' ')
}

function getInitiativeGridTemplate(): string {
  const columns = ['minmax(260px,1.4fr)']
  if (isInitiativeRowFieldVisible('health')) columns.push('112px')
  if (isInitiativeRowFieldVisible('lead')) columns.push('124px')
  if (isInitiativeRowFieldVisible('projects')) columns.push('132px')
  if (isInitiativeRowFieldVisible('issues')) columns.push('156px')
  if (isInitiativeRowFieldVisible('updated')) columns.push('112px')
  return columns.join(' ')
}

function getSavedViewGridTemplate(): string {
  const columns = ['minmax(260px,1fr)']
  if (isSavedViewRowFieldVisible('type')) columns.push('112px')
  if (isSavedViewRowFieldVisible('items')) columns.push('88px')
  if (isSavedViewRowFieldVisible('owner')) columns.push('132px')
  if (isSavedViewRowFieldVisible('updated')) columns.push('112px')
  return columns.join(' ')
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
  const anchorIndex = flatTickets.findIndex(ticket => getDisplayedIssueRowKey(ticket) === anchorKey)
  const targetIndex = flatTickets.findIndex(ticket => getDisplayedIssueRowKey(ticket) === targetKey)
  if (anchorIndex === -1 || targetIndex === -1) return targetKey ? [targetKey] : []

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return flatTickets.slice(start, end + 1).map(getDisplayedIssueRowKey)
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

function generateCustomViewId(): string {
  return `custom-view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function startCreateView(): void {
  const contextKey = contextKeyForCurrentView.value
  if (!contextKey) {
    return
  }

  const display = captureDisplay()
  viewEditorPreviousViewId.value = currentView.value
  viewEditorPreviousDisplay.value = copyViewDisplay(display)
  viewEditorDraft.value = {
    id: generateCustomViewId(),
    name: '',
    description: '',
    contextKey,
    filters: clausesToCustomViewFilters(currentViewFilters.value),
    display: copyViewDisplay(display),
  }
  viewEditorMode.value = 'create'
  currentView.value = viewEditorDraft.value.id
  focusedIssueKey.value = null
  clearCheckedIssues()
  closeTicket()
}

function startEditView(viewId: string): void {
  const customView = getCustomView(viewId)
  if (!customView) {
    return
  }

  const display = currentView.value === viewId ? captureDisplay() : customView.display
  viewEditorPreviousViewId.value = currentView.value
  viewEditorPreviousDisplay.value = captureDisplay()
  viewEditorDraft.value = {
    ...copyCustomView(customView),
    display: copyViewDisplay(display),
  }
  viewEditorMode.value = 'edit'
  currentView.value = viewId
  focusedIssueKey.value = null
  clearCheckedIssues()
  closeTicket()
}

function finishViewEditor(): void {
  viewEditorMode.value = null
  viewEditorDraft.value = null
  viewEditorPreviousViewId.value = null
  viewEditorPreviousDisplay.value = null
}

function saveViewEditor(): void {
  const draft = viewEditorDraft.value
  if (!draft) {
    return
  }

  const name = draft.name.trim()
  if (!name) {
    return
  }

  const savedView: CustomView = {
    ...draft,
    name,
    description: draft.description.trim(),
    filters: clausesToCustomViewFilters(currentViewFilters.value),
    display: captureDisplay(),
  }

  upsertCustomView(savedView)

  const nextFilters = { ...savedViewFilters.value }
  delete nextFilters[savedView.id]
  savedViewFilters.value = nextFilters

  const nextDisplays = { ...savedViewDisplays.value }
  delete nextDisplays[savedView.id]
  savedViewDisplays.value = nextDisplays

  finishViewEditor()
  currentView.value = savedView.id
}

function cancelViewEditor(): void {
  const previousViewId = viewEditorPreviousViewId.value
  const previousDisplay = viewEditorPreviousDisplay.value

  suppressViewDisplaySync.value = true
  if (previousDisplay) {
    applyDisplay(previousDisplay)
  }

  finishViewEditor()

  if (previousViewId) {
    currentView.value = previousViewId
  }

  nextTick(() => {
    suppressViewDisplaySync.value = false
  })
}

function discardViewEditorAndSwitch(viewId: string): void {
  suppressViewDisplaySync.value = true
  finishViewEditor()
  currentView.value = viewId
  applyDisplay(resolveDisplayForView(viewId))
  nextTick(() => {
    suppressViewDisplaySync.value = false
  })
}

function activateCustomView(viewId: string): void {
  if (!getCustomView(viewId) && viewEditorDraft.value?.id !== viewId) {
    return
  }

  if (viewEditorMode.value && viewEditorDraft.value?.id !== viewId) {
    discardViewEditorAndSwitch(viewId)
    focusedIssueKey.value = null
    clearCheckedIssues()
    closeTicket()
    return
  }

  currentView.value = viewId
  focusedIssueKey.value = null
  clearCheckedIssues()
  closeTicket()
}

function updateViewEditorName(value: string): void {
  if (!viewEditorDraft.value) {
    return
  }

  viewEditorDraft.value = {
    ...viewEditorDraft.value,
    name: value,
  }
}

function updateViewEditorDescription(value: string): void {
  if (!viewEditorDraft.value) {
    return
  }

  viewEditorDraft.value = {
    ...viewEditorDraft.value,
    description: value,
  }
}

function openViewEditorFilters(): void {
  openFilterMenu()
}

function openViewEditorSettings(): void {
  displayOptionsOpen.value = true
  filterMenuOpen.value = false
}

function handleViewTabClick(tab: ViewTab): void {
  closeCustomViewContextMenu()

  if (tab.custom) {
    activateCustomView(tab.id)
    return
  }

  handleViewChange(tab.id)
}

function closeCustomViewContextMenu(): void {
  customViewContextMenu.value = {
    ...customViewContextMenu.value,
    open: false,
  }
}

function handleViewTabContextMenu(tab: ViewTab, event: MouseEvent): void {
  if (!tab.custom || tab.draft) {
    closeCustomViewContextMenu()
    return
  }

  customViewContextMenu.value = {
    open: true,
    viewId: tab.id,
    x: event.clientX,
    y: event.clientY,
  }
}

function editContextCustomView(): void {
  const viewId = customViewContextMenu.value.viewId
  closeCustomViewContextMenu()
  if (viewId) {
    startEditView(viewId)
  }
}

function deleteContextCustomView(): void {
  const viewId = customViewContextMenu.value.viewId
  const customView = getCustomView(viewId)
  closeCustomViewContextMenu()

  if (!customView) {
    return
  }

  if (isFavoriteView(viewId)) {
    toggleFavoriteView(viewId, [])
  }

  removeCustomView(viewId)

  const nextFilters = { ...savedViewFilters.value }
  delete nextFilters[viewId]
  savedViewFilters.value = nextFilters

  const nextDisplays = { ...savedViewDisplays.value }
  delete nextDisplays[viewId]
  savedViewDisplays.value = nextDisplays

  if (viewEditorDraft.value?.id === viewId) {
    finishViewEditor()
  }

  if (currentView.value === viewId) {
    handleViewChange(getBaseViewIdForCustomContext(customView.contextKey))
  }
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

  if (viewEditorMode.value) {
    discardViewEditorAndSwitch(viewId)
    focusedIssueKey.value = null
    clearCheckedIssues()
    closeTicket()

    if (viewId === 'search') {
      searchResultTab.value = 'all'
      nextTick(() => {
        searchInputRef.value?.focus()
      })
    }

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

function handleFavoriteViewChange(viewId: string) {
  restoreFavoriteViewFilters(viewId)
  handleViewChange(viewId)
}

function openAddSpaceModal(): void {
  isAddSpaceModalOpen.value = true
}

function closeAddSpaceModal(): void {
  isAddSpaceModalOpen.value = false
}

async function handleLeaveSpace(spaceKey: string): Promise<void> {
  await deleteSpace(spaceKey)
  if (currentView.value.startsWith(`team:${spaceKey}:`)) {
    handleViewChange('my-issues')
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
  closeCustomViewContextMenu()
  commandQuery.value = initialQuery
  commandActiveIndex.value = 0
  commandMenuOpen.value = true
  displayOptionsOpen.value = false
  closeFilterMenu()
}

function closeCommandMenu() {
  commandMenuOpen.value = false
  commandQuery.value = ''
  commandActiveIndex.value = 0
}

function closeDisplayOptions() {
  displayOptionsOpen.value = false
  groupOrderingOpen.value = false
}

function toggleDisplayOptions() {
  closeCustomViewContextMenu()
  if (!displayOptionsOpen.value) {
    closeFilterMenu()
    groupOrderingOpen.value = false
  }
  displayOptionsOpen.value = !displayOptionsOpen.value
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node)) return

  if (customViewContextMenu.value.open && !customViewContextMenuRef.value?.contains(target)) {
    closeCustomViewContextMenu()
  }

  if (displayOptionsOpen.value) {
    if (
      displayOptionsPanelRef.value?.contains(target)
      || displayOptionsButtonRef.value?.contains(target)
    ) {
      return
    }

    closeDisplayOptions()
  }

  if (filterMenuOpen.value) {
    if (
      filterMenuPanelRef.value?.contains(target)
      || filterMenuButtonRef.value?.contains(target)
    ) {
      return
    }

    closeFilterMenu()
  }
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
  if (!shouldShowIssueSectionHeader()) return false

  return collapsedIssueSectionIds.value.includes(getIssueSectionCollapseId(section))
}

function shouldShowIssueSectionHeader(): boolean {
  return listGrouping.value !== 'none' && currentView.value !== 'search'
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

function getProjectSectionCollapseId(section: ProjectSection): string {
  return `${currentView.value}:${projectGrouping.value}:${section.id}`
}

function isProjectSectionCollapsed(section: ProjectSection): boolean {
  if (projectGrouping.value === 'none') return false

  return collapsedProjectSectionIds.value.includes(getProjectSectionCollapseId(section))
}

function toggleProjectSection(section: ProjectSection): void {
  const sectionId = getProjectSectionCollapseId(section)
  collapsedProjectSectionIds.value = isProjectSectionCollapsed(section)
    ? collapsedProjectSectionIds.value.filter(id => id !== sectionId)
    : [...collapsedProjectSectionIds.value, sectionId]
}

function getFlatVisibleTickets(): JiraTicket[] {
  return issueSections.value.flatMap(getExpandedSectionTickets)
}

function openRelativeVisibleTicket(delta: number, extendSelection = false) {
  const flatTickets = getFlatVisibleTickets()
  if (!flatTickets.length) return

  const currentKey = selectedKey.value || focusedIssueKey.value
  const currentIndex = currentKey
    ? flatTickets.findIndex(ticket => getDisplayedIssueRowKey(ticket) === currentKey)
    : -1
  const nextIndex = currentIndex === -1
    ? (delta > 0 ? 0 : flatTickets.length - 1)
    : Math.min(flatTickets.length - 1, Math.max(0, currentIndex + delta))
  const nextTicket = flatTickets[nextIndex]
  if (!nextTicket) return

  if (selectedKey.value) {
    openTicket(getDisplayedIssueRowKey(nextTicket))
    return
  }

  if (extendSelection) {
    const nextTicketKey = getDisplayedIssueRowKey(nextTicket)
    const anchorKey = selectionAnchorKey.value ?? focusedIssueKey.value ?? currentKey ?? nextTicketKey
    selectionAnchorKey.value = anchorKey
    addCheckedIssueRange(anchorKey, nextTicketKey)
  }

  focusedIssueKey.value = getDisplayedIssueRowKey(nextTicket)
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
    if (groupOrderingOpen.value) {
      closeGroupOrdering()
      return
    }
    closeDisplayOptions()
    return
  }

  if (filterMenuOpen.value && event.key === 'Escape') {
    event.preventDefault()
    closeFilterMenu()
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
    const keyToToggle = selectedKey.value || focusedIssueKey.value || (firstVisibleTicket ? getDisplayedIssueRowKey(firstVisibleTicket) : null)
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
    const keyToOpen = focusedIssueKey.value ?? (firstVisibleTicket ? getDisplayedIssueRowKey(firstVisibleTicket) : null)
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
  if (!suppressViewDisplaySync.value) {
    persistDisplayForView(currentView.value, captureDisplay())
  }

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
        :favorite-views="favoriteViewNavItems"
        @select="openTicket"
        @prefetch="prefetchTicket"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        @refresh="handleRefresh"
        @home="handleViewChange('my-issues')"
        @settings="openSettings"
        @command="openCommandMenu"
        @view="handleViewChange"
        @favorite-view="handleFavoriteViewChange"
        @add-space="openAddSpaceModal"
        @leave-space="handleLeaveSpace"
      />

      <div
        v-if="!sidebarCollapsed"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        class="absolute top-0 -right-4 z-10 h-full w-4 cursor-col-resize touch-none bg-transparent focus:outline-none [cursor:col-resize]"
        aria-label="Resize sidebar"
        @pointerdown="startSidebarResize"
      />
    </div>

    <main class="min-w-0 flex-1 overflow-hidden p-2">
      <div class="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-white/[0.055] bg-issue-detail-bg">
        <header
          v-if="!selectedTicket"
          class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-4"
        >
          <div class="min-w-0">
            <div class="flex min-w-0 items-baseline gap-2">
              <h1 class="truncate text-[20px] font-semibold text-[#f0f1f4]">{{ viewTitle }}</h1>
              <span v-if="currentView === 'initiatives'" class="shrink-0 text-[12px] text-[#777a83]">
                {{ initiativeRows.length }} {{ initiativeRows.length === 1 ? 'initiative' : 'initiatives' }}
              </span>
              <span v-else-if="isViewsDirectory" class="shrink-0 text-[12px] text-[#777a83]">
                {{ displayedSavedViewRows.length }} {{ displayedSavedViewRows.length === 1 ? 'view' : 'views' }}
              </span>
              <span v-else-if="currentView === 'inbox'" class="shrink-0 text-[12px] text-[#777a83]">
                {{ inboxItems.length }} {{ inboxItems.length === 1 ? 'notification' : 'notifications' }}
               </span>
               <span v-else-if="currentView !== 'search' && !currentTeamKey" class="shrink-0 text-[12px] text-[#777a83]">
                 {{ visibleIssueCount }} {{ visibleIssueCount === 1 ? 'issue' : 'issues' }}
               </span>
               <button
                 v-if="currentViewIsFavoritable"
                 type="button"
                 class="ml-1 flex h-6 w-6 shrink-0 self-center items-center justify-center rounded-md text-[#8f9198] transition hover:bg-white/[0.04] hover:text-[#f0f1f4]"
                 :class="isFavoriteView(currentView) ? 'text-[#d7a543] hover:text-[#d7a543]' : ''"
                 :aria-pressed="isFavoriteView(currentView)"
                 :title="isFavoriteView(currentView) ? 'Remove view from favorites' : 'Add view to favorites'"
                 @click="toggleCurrentViewFavorite"
               >
                 <span class="text-[14px] leading-none">★</span>
               </button>
            </div>
          </div>

          <div class="relative z-20 flex shrink-0 items-center gap-1.5">
            <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md text-[#8f9198] transition hover:bg-white/[0.04] hover:text-[#f0f1f4] disabled:opacity-50"
              :disabled="refreshing"
              title="Refresh"
              @click="handleRefresh"
            >
              <Icon
                name="lucide:refresh-cw"
                class="h-4 w-4"
                :class="{ 'animate-spin': refreshing }"
                aria-hidden="true"
              />
            </button>
            </div>

            <div class="absolute top-12 right-0 flex items-center gap-1.5">
            <button
              v-if="false && !selectedTicket"
              ref="filterMenuButtonRef"
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md border text-[#8f9198] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              :class="hasCurrentViewFilters || filterMenuOpen ? 'border-white/[0.14] bg-white/[0.075] text-[#f0f1f4]' : 'border-white/[0.08] bg-white/[0.035]'"
              title="Filter"
              @click="toggleFilterMenu"
            >
              <Icon name="lucide:list-filter" class="h-4 w-4" aria-hidden="true" />
            </button>

            <div
              v-if="filterMenuOpen && !selectedTicket"
              ref="filterMenuPanelRef"
              class="absolute right-10 top-10 z-30 flex max-h-[35rem] w-[34rem] overflow-hidden rounded-lg border border-white/[0.08] bg-[#15161a] shadow-xl shadow-black/40"
            >
              <div class="w-[15rem] shrink-0 border-r border-white/[0.06] py-1.5">
                <div class="px-2 pb-1">
                  <input
                    v-model="filterFieldSearchQuery"
                    type="text"
                    name="linear-filter-field-search"
                    class="h-8 w-full rounded-md border border-white/[0.06] bg-black/20 px-2 text-[12px] text-[#d7d8dc] outline-none placeholder:text-[#6f727b] focus:border-white/[0.14]"
                    placeholder="Add Filter..."
                  >
                </div>

                <button
                  v-for="entry in visibleFilterMenuEntries"
                  :key="entry.id"
                  type="button"
                  class="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] transition"
                  :class="activeFilterEntryId === entry.id ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#b9bbc3] hover:bg-white/[0.045] hover:text-[#f0f1f4]'"
                  @mouseenter="activeFilterEntryId = entry.id"
                  @focus="activeFilterEntryId = entry.id"
                  @click="entry.id === 'shared' ? toggleFilterClause('shared', 'shared', 'Shared') : activeFilterEntryId = entry.id"
                >
                  <span
                    v-if="entry.id === 'shared'"
                    class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none transition"
                    :class="isFilterClauseSelected('shared', 'shared') ? 'border-[#4dbb83] bg-[#4dbb83] text-[#0d0e10]' : 'border-white/[0.18] text-transparent'"
                  >✓</span>
                  <span v-else class="w-4 shrink-0 text-center text-[#8f9198]">{{ entry.icon }}</span>
                  <span class="min-w-0 flex-1 truncate">{{ entry.label }}</span>
                  <span v-if="entry.hasSubmenu" class="text-[11px] text-[#777a83]">›</span>
                </button>
                <div v-if="visibleFilterMenuEntries.length === 0" class="px-3 py-8 text-center text-[12px] text-[#777a83]">
                  No matching filters
                </div>
              </div>

              <div class="min-w-0 flex-1 py-1.5">
                <div class="mb-1 flex h-8 items-center justify-between gap-3 border-b border-white/[0.06] px-3 pb-1">
                  <span class="text-[12px] font-medium text-[#d7d8dc]">Filters</span>
                  <button
                    type="button"
                    class="rounded px-1.5 py-1 text-[12px] text-[#aeb0b7] hover:bg-white/[0.05] hover:text-[#f0f1f4] disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!hasModifiedFilterOptions"
                    @click="clearCurrentViewFilters"
                  >
                    Reset
                  </button>
                </div>

                <div v-if="isIssueDisplayView" class="border-b border-white/[0.06] px-3 py-2">
                  <p class="mb-2 text-[12px] font-medium text-[#d7d8dc]">Issue inclusion</p>
                  <label class="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 rounded-md py-1.5">
                    <span class="text-[12px] text-[#aeb0b7]">Completed issues</span>
                    <select v-model="completedRange" name="filter-completed-issues-range" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                      <option v-for="option in issueVisibilityRangeOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-4 rounded-md py-1.5 text-left transition hover:bg-white/[0.025]"
                    role="switch"
                    :aria-checked="showSubIssues"
                    @click="showSubIssues = !showSubIssues"
                  >
                    <span class="text-[12px] text-[#aeb0b7]">Show sub-issues</span>
                    <span
                      class="flex h-4 w-7 items-center rounded-full border p-0.5 transition"
                      :class="showSubIssues ? 'border-white/[0.14] bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'"
                    >
                      <span
                        class="h-2.5 w-2.5 rounded-full bg-[#f0f1f4] transition"
                        :class="showSubIssues ? 'translate-x-3' : 'translate-x-0'"
                      ></span>
                    </span>
                  </button>

                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-4 rounded-md py-1.5 text-left transition hover:bg-white/[0.025]"
                    role="switch"
                    :aria-checked="showBacklogIssues"
                    @click="showBacklogIssues = !showBacklogIssues"
                  >
                    <span class="text-[12px] text-[#aeb0b7]">Show backlog</span>
                    <span
                      class="flex h-4 w-7 items-center rounded-full border p-0.5 transition"
                      :class="showBacklogIssues ? 'border-white/[0.14] bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'"
                    >
                      <span
                        class="h-2.5 w-2.5 rounded-full bg-[#f0f1f4] transition"
                        :class="showBacklogIssues ? 'translate-x-3' : 'translate-x-0'"
                      ></span>
                    </span>
                  </button>
                </div>

                <template v-if="activeFilterEntryId === 'dates'">
                  <div class="border-b border-white/[0.06] px-2 pb-1">
                    <button
                      v-for="field in dateFilterFields"
                      :key="field.id"
                      type="button"
                      class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]"
                      :class="activeDateFilterId === field.id ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#b9bbc3] hover:bg-white/[0.045] hover:text-[#f0f1f4]'"
                      @mouseenter="activeDateFilterId = field.id"
                      @click="activeDateFilterId = field.id"
                    >
                      <span class="w-4 text-center text-[#8f9198]">{{ field.icon }}</span>
                      <span class="flex-1 truncate">{{ field.label }}</span>
                      <span class="text-[11px] text-[#777a83]">›</span>
                    </button>
                  </div>
                  <div class="px-2 pt-1">
                    <button
                      v-for="option in activeDateFilterOptions"
                      :key="option.value"
                      type="button"
                      role="checkbox"
                      :aria-checked="isFilterClauseSelected(activeDateFilterId, option.value)"
                      class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
                      :class="isFilterClauseSelected(activeDateFilterId, option.value) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#b9bbc3] hover:bg-white/[0.045] hover:text-[#f0f1f4]'"
                      @click="toggleFilterClause(activeDateFilterId, option.value, option.label)"
                    >
                      <span
                        class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none transition"
                        :class="isFilterClauseSelected(activeDateFilterId, option.value) ? 'border-[#4dbb83] bg-[#4dbb83] text-[#0d0e10]' : 'border-white/[0.18] text-transparent'"
                      >✓</span>
                      <span class="w-4 text-center text-[#8f9198]">◷</span>
                      <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                      <span class="text-[11px] text-[#6f727b]">{{ option.count }}</span>
                    </button>
                  </div>
                </template>

                <template v-else-if="activeFilterEntryId === 'projectProperties'">
                  <div class="border-b border-white/[0.06] px-2 pb-1">
                    <button
                      v-for="field in projectPropertyFilterFields"
                      :key="field.id"
                      type="button"
                      class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]"
                      :class="activeProjectPropertyFilterId === field.id ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#b9bbc3] hover:bg-white/[0.045] hover:text-[#f0f1f4]'"
                      @mouseenter="activeProjectPropertyFilterId = field.id"
                      @click="activeProjectPropertyFilterId = field.id"
                    >
                      <span class="w-4 text-center text-[#8f9198]">{{ field.icon }}</span>
                      <span class="flex-1 truncate">{{ field.label }}</span>
                      <span class="text-[11px] text-[#777a83]">›</span>
                    </button>
                  </div>
                  <div class="px-2 pt-1">
                    <button
                      v-for="option in activeFilterOptions"
                      :key="option.value"
                      type="button"
                      role="checkbox"
                      :aria-checked="isFilterClauseSelected(activeProjectPropertyFilterId, option.value)"
                      class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
                      :class="isFilterClauseSelected(activeProjectPropertyFilterId, option.value) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#b9bbc3] hover:bg-white/[0.045] hover:text-[#f0f1f4]'"
                      @click="toggleFilterClause(activeProjectPropertyFilterId, option.value, option.label)"
                    >
                      <span
                        class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none transition"
                        :class="isFilterClauseSelected(activeProjectPropertyFilterId, option.value) ? 'border-[#4dbb83] bg-[#4dbb83] text-[#0d0e10]' : 'border-white/[0.18] text-transparent'"
                      >✓</span>
                      <span class="w-4 text-center text-[#8f9198]">{{ option.icon }}</span>
                      <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                      <span class="text-[11px] text-[#6f727b]">{{ option.count }}</span>
                    </button>
                  </div>
                </template>

                <template v-else>
                  <div class="px-2 pb-1">
                    <input
                      v-model="filterSearchQuery"
                      type="text"
                      name="linear-filter-search"
                      class="h-8 w-full rounded-md border border-white/[0.06] bg-black/20 px-2 text-[12px] text-[#d7d8dc] outline-none placeholder:text-[#6f727b] focus:border-white/[0.14]"
                      :placeholder="`Filter ${activeFilterEntry.label.toLowerCase()}...`"
                    >
                  </div>
                  <div class="max-h-[30rem] overflow-y-auto px-2">
                    <button
                      v-for="option in activeFilterOptions"
                      :key="option.value"
                      type="button"
                      role="checkbox"
                      :aria-checked="isFilterClauseSelected(activeValueFilterFieldId, option.value)"
                      class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
                      :class="isFilterClauseSelected(activeValueFilterFieldId, option.value) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#b9bbc3] hover:bg-white/[0.045] hover:text-[#f0f1f4]'"
                      @click="toggleFilterClause(activeValueFilterFieldId, option.value, option.label)"
                    >
                      <span
                        class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none transition"
                        :class="isFilterClauseSelected(activeValueFilterFieldId, option.value) ? 'border-[#4dbb83] bg-[#4dbb83] text-[#0d0e10]' : 'border-white/[0.18] text-transparent'"
                      >✓</span>
                      <span class="w-4 shrink-0 text-center text-[#8f9198]">{{ option.icon }}</span>
                      <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                      <span class="text-[11px] text-[#6f727b]">{{ option.count }}</span>
                    </button>
                    <div v-if="activeFilterOptions.length === 0" class="px-3 py-8 text-center text-[12px] text-[#777a83]">
                      No matching options
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <button
              v-if="false && !selectedTicket"
              ref="displayOptionsButtonRef"
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.035] text-[#8f9198] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              title="Display options"
              @click="toggleDisplayOptions"
            >
              <Icon name="lucide:sliders-horizontal" class="h-4 w-4" aria-hidden="true" />
            </button>

            <div
              v-if="displayOptionsOpen && !selectedTicket"
              ref="displayOptionsPanelRef"
              class="absolute right-0 top-10 z-20 w-[22rem] overflow-hidden rounded-lg border border-white/[0.08] bg-surface-2 shadow-xl shadow-black/35"
            >
              <div v-if="groupOrderingOpen" class="overflow-hidden">
                <div class="flex h-11 items-center justify-between border-b border-white/[0.06] px-3">
                  <button
                    type="button"
                    class="flex h-7 min-w-0 items-center gap-2 rounded-md pr-2 text-[13px] text-[#aeb0b7] hover:text-[#f0f1f4]"
                    @click="closeGroupOrdering"
                  >
                    <span class="text-[16px] leading-none">‹</span>
                    <span>Group ordering</span>
                  </button>
                  <button
                    type="button"
                    class="rounded px-1.5 py-1 text-[12px] text-[#aeb0b7] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
                    @click="resetCurrentIssueGroupOrdering"
                  >
                    Reset
                  </button>
                </div>

                <div class="max-h-[22rem] overflow-y-auto py-2">
                  <div v-if="issueGroupOrderingRows.length" class="space-y-0.5">
                    <div
                      v-for="row in issueGroupOrderingRows"
                      :key="row.id"
                      class="group flex h-8 items-center gap-2 px-3 text-[13px] transition"
                      :class="row.visible ? 'text-[#d7d8dc]' : 'text-[#777a83]'"
                      draggable="true"
                      @dragstart="startIssueGroupDrag(row.id)"
                      @dragover.prevent
                      @drop="dropIssueGroup(row.id)"
                      @dragend="finishIssueGroupDrag"
                    >
                      <span class="cursor-grab text-[14px] text-[#555861] active:cursor-grabbing">⁝⁝</span>
                      <span class="h-3.5 w-3.5 shrink-0 rounded-full border" :class="getIssueGroupMarkerClass(row.label)"></span>
                      <span class="min-w-0 flex-1 truncate">{{ row.label }}</span>
                      <button
                        type="button"
                        class="flex h-6 w-6 items-center justify-center rounded-md text-[#aeb0b7] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
                        :aria-label="row.visible ? `Hide ${row.label}` : `Show ${row.label}`"
                        @click="toggleIssueGroupVisibility(row.id)"
                      >
                        <svg v-if="row.visible" class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M1.75 8s2.25-4 6.25-4 6.25 4 6.25 4-2.25 4-6.25 4-6.25-4-6.25-4Z" />
                          <circle cx="8" cy="8" r="1.75" />
                        </svg>
                        <svg v-else class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M2.5 2.5l11 11M6.2 6.2A2 2 0 0 0 8 10a2 2 0 0 0 1.8-1.1M4.7 4.9C2.8 6.1 1.75 8 1.75 8s2.25 4 6.25 4c1.1 0 2.05-.3 2.85-.72M7.2 4.04A6.7 6.7 0 0 1 8 4c4 0 6.25 4 6.25 4a9.02 9.02 0 0 1-1.55 1.88" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div v-else class="px-3 py-8 text-center text-[12px] text-[#777a83]">
                    No groups to order
                  </div>
                </div>
              </div>

              <div v-if="!groupOrderingOpen" class="space-y-0.5 p-2">
                <div class="rounded-md px-2 py-1.5">
                  <div class="grid grid-cols-2 gap-1 rounded-md bg-black/20 p-0.5">
                    <button type="button" class="rounded bg-white/[0.08] px-2 py-1 text-[12px] text-[#f0f1f4]">List</button>
                    <button type="button" class="rounded px-2 py-1 text-[12px] text-[#777a83]" disabled>Board</button>
                  </div>
                </div>

                <template v-if="isIssueDisplayView">
                  <label class="grid grid-cols-[7.5rem_1.75rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.025]">
                    <span class="text-[12px] text-[#8f9198]">Grouping</span>
                    <button
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-md text-[#aeb0b7] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
                      aria-label="Group ordering"
                      title="Group ordering"
                      @click.prevent="openGroupOrdering"
                    >
                      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 12V4m0 0L2.75 6.25M5 4l2.25 2.25M11 4v8m0 0 2.25-2.25M11 12 8.75 9.75" />
                      </svg>
                    </button>
                    <select v-model="listGrouping" name="issue-grouping" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                      <option v-for="option in issueGroupingOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                    </select>
                  </label>

                  <label class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.025]">
                    <span class="text-[12px] text-[#8f9198]">Sub-grouping</span>
                    <select v-model="listSubGrouping" name="issue-sub-grouping" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                      <option v-for="option in issueGroupingOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                    </select>
                  </label>

                  <label class="grid grid-cols-[7.5rem_1.75rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.025]">
                    <span class="text-[12px] text-[#8f9198]">Ordering</span>
                    <button
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-md text-[#aeb0b7] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
                      :aria-label="listOrderingDirection === 'asc' ? 'Order ascending' : 'Order descending'"
                      :title="listOrderingDirection === 'asc' ? 'Order ascending' : 'Order descending'"
                      @click.prevent="toggleOrderingDirection"
                    >
                      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path v-if="listOrderingDirection === 'asc'" stroke-linecap="round" stroke-linejoin="round" d="M4.75 12V4m0 0L2.5 6.25M4.75 4 7 6.25M9 5h4.5M9 8h3.5M9 11h2" />
                        <path v-else stroke-linecap="round" stroke-linejoin="round" d="M4.75 4v8m0 0L7 9.75M4.75 12 2.5 9.75M9 5h2M9 8h3.5M9 11h4.5" />
                      </svg>
                    </button>
                    <select v-model="listOrdering" name="issue-ordering" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                      <option v-for="option in issueOrderingOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left transition hover:bg-white/[0.025]"
                    role="switch"
                    :aria-checked="orderCompletedByRecency"
                    @click="orderCompletedByRecency = !orderCompletedByRecency"
                  >
                    <span class="text-[12px] text-[#8f9198]">Order completed by recency</span>
                    <span
                      class="flex h-4 w-7 items-center rounded-full border p-0.5 transition"
                      :class="orderCompletedByRecency ? 'border-white/[0.14] bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'"
                    >
                      <span
                        class="h-2.5 w-2.5 rounded-full bg-[#f0f1f4] transition"
                        :class="orderCompletedByRecency ? 'translate-x-3' : 'translate-x-0'"
                      ></span>
                    </span>
                  </button>
                </template>
              </div>

              <div v-if="!groupOrderingOpen && isIssueDisplayView" class="border-t border-white/[0.06] p-3">
                <p class="mb-2 text-[12px] font-medium text-[#d7d8dc]">List options</p>
                <button
                  type="button"
                  class="mb-3 flex w-full items-center justify-between gap-4 rounded-md px-0 py-1 text-left transition"
                  role="switch"
                  :aria-checked="showEmptyGroups"
                  @click="showEmptyGroups = !showEmptyGroups"
                >
                  <span class="text-[12px] text-[#8f9198]">Show empty groups</span>
                  <span
                    class="flex h-4 w-7 items-center rounded-full border p-0.5 transition"
                    :class="showEmptyGroups ? 'border-white/[0.14] bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'"
                  >
                    <span
                      class="h-2.5 w-2.5 rounded-full bg-[#f0f1f4] transition"
                      :class="showEmptyGroups ? 'translate-x-3' : 'translate-x-0'"
                    ></span>
                  </span>
                </button>
                <div class="mb-2 flex items-center justify-between gap-3">
                  <span class="text-[12px] text-[#8f9198]">Display properties</span>
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
                    :aria-pressed="isIssueRowFieldVisible(field.id)"
                    @click="toggleIssueRowField(field.id)"
                  >
                    <span>{{ field.label }}</span>
                  </button>
                </div>
              </div>

              <div v-if="!groupOrderingOpen && isIssueDisplayView" class="flex items-center justify-end gap-4 border-t border-white/[0.06] px-3 py-2">
                <button
                  type="button"
                  class="rounded px-1.5 py-1 text-[12px] text-[#d7d8dc] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
                  @click="resetIssueDisplayOptions"
                >
                  Reset
                </button>
              </div>

              <div v-else-if="!groupOrderingOpen && isProjectDisplayView" class="border-t border-white/[0.06] p-3">
                <div class="space-y-2 pb-3">
                  <label class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 rounded-md py-1">
                    <span class="text-[12px] text-[#8f9198]">Grouping</span>
                    <select v-model="projectGrouping" name="project-grouping" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                      <option v-for="option in projectGroupingOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                    </select>
                  </label>

                  <label class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 rounded-md py-1">
                    <span class="text-[12px] text-[#8f9198]">Ordering</span>
                    <select v-model="projectOrdering" name="project-ordering" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                      <option v-for="option in projectOrderingOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                    </select>
                  </label>

                  <label class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 rounded-md py-1">
                    <span class="text-[12px] text-[#8f9198]">Show closed projects</span>
                    <select v-model="projectClosedRange" name="project-closed-range" class="w-full rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-1.5 text-[12px] text-[#d7d8dc] outline-none focus:border-white/[0.16]">
                      <option v-for="option in projectClosedRangeOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                    </select>
                  </label>
                </div>

                <div class="mb-2 flex items-center justify-between gap-3">
                  <span class="text-[12px] text-[#8f9198]">Visible properties</span>
                  <span class="text-[11px] text-[#6f727b]">{{ visibleProjectRowFields.length }} shown</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="field in projectRowFieldOptions"
                    :key="field.id"
                    type="button"
                    class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition"
                    :class="isProjectRowFieldVisible(field.id)
                      ? 'border-white/[0.12] bg-white/[0.06] text-[#f0f1f4]'
                      : 'border-white/[0.06] bg-white/[0.025] text-[#8f9198] hover:bg-white/[0.04] hover:text-[#d7d8dc]'"
                    :disabled="visibleProjectRowFields.length === 1 && isProjectRowFieldVisible(field.id)"
                    @click="toggleProjectRowField(field.id)"
                  >
                    <span
                      class="flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]"
                      :class="isProjectRowFieldVisible(field.id) ? 'border-white/[0.18] text-slate-200' : 'border-white/[0.1] text-transparent'"
                    >
                      ✓
                    </span>
                    <span>{{ field.label }}</span>
                  </button>
                </div>
                <div class="mt-3 flex items-center justify-end border-t border-white/[0.06] pt-2">
                  <button
                    type="button"
                    class="rounded px-1.5 py-1 text-[12px] text-[#d7d8dc] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
                    @click="resetProjectDisplayOptions"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div v-else-if="!groupOrderingOpen && isInitiativeDisplayView" class="border-t border-white/[0.06] p-3">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <span class="text-[12px] text-[#8f9198]">Visible properties</span>
                  <span class="text-[11px] text-[#6f727b]">{{ visibleInitiativeRowFields.length }} shown</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="field in initiativeRowFieldOptions"
                    :key="field.id"
                    type="button"
                    class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition"
                    :class="isInitiativeRowFieldVisible(field.id)
                      ? 'border-white/[0.12] bg-white/[0.06] text-[#f0f1f4]'
                      : 'border-white/[0.06] bg-white/[0.025] text-[#8f9198] hover:bg-white/[0.04] hover:text-[#d7d8dc]'"
                    :disabled="visibleInitiativeRowFields.length === 1 && isInitiativeRowFieldVisible(field.id)"
                    @click="toggleInitiativeRowField(field.id)"
                  >
                    <span
                      class="flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]"
                      :class="isInitiativeRowFieldVisible(field.id) ? 'border-white/[0.18] text-slate-200' : 'border-white/[0.1] text-transparent'"
                    >
                      ✓
                    </span>
                    <span>{{ field.label }}</span>
                  </button>
                </div>
              </div>

              <div v-else-if="!groupOrderingOpen && isSavedViewDisplayView" class="border-t border-white/[0.06] p-3">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <span class="text-[12px] text-[#8f9198]">Visible properties</span>
                  <span class="text-[11px] text-[#6f727b]">{{ visibleSavedViewRowFields.length }} shown</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="field in savedViewRowFieldOptions"
                    :key="field.id"
                    type="button"
                    class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition"
                    :class="isSavedViewRowFieldVisible(field.id)
                      ? 'border-white/[0.12] bg-white/[0.06] text-[#f0f1f4]'
                      : 'border-white/[0.06] bg-white/[0.025] text-[#8f9198] hover:bg-white/[0.04] hover:text-[#d7d8dc]'"
                    :disabled="visibleSavedViewRowFields.length === 1 && isSavedViewRowFieldVisible(field.id)"
                    @click="toggleSavedViewRowField(field.id)"
                  >
                    <span
                      class="flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]"
                      :class="isSavedViewRowFieldVisible(field.id) ? 'border-white/[0.18] text-slate-200' : 'border-white/[0.1] text-transparent'"
                    >
                      ✓
                    </span>
                    <span>{{ field.label }}</span>
                  </button>
                </div>
              </div>
            </div>
            </div>
          </div>
        </header>

        <div v-if="!selectedTicket && (viewTabs.length || supportsCustomViews)" class="flex h-10 shrink-0 items-center justify-between gap-3 px-3">
          <div class="flex min-w-0 items-center gap-1">
            <button
              v-for="tab in viewTabs"
              :key="tab.id"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition"
              :class="[
                currentView === tab.id ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]',
                tab.draft ? 'border border-dashed border-white/[0.16]' : '',
              ]"
              @click="handleViewTabClick(tab)"
              @contextmenu.prevent="handleViewTabContextMenu(tab, $event)"
            >
              <Icon v-if="tab.custom" name="lucide:layers" class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ tab.label }}</span>
              <Icon v-if="tab.draft" name="lucide:square-pen" class="h-3 w-3 text-[#777a83]" aria-hidden="true" />
            </button>

            <button
              v-if="supportsCustomViews"
              type="button"
              class="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-[#6f727b] transition hover:bg-white/[0.045] hover:text-[#d7d8dc] disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="viewEditorMode !== null"
              title="Create view"
              @click="startCreateView"
            >
              <span class="relative h-3.5 w-3.5" aria-hidden="true">
                <Icon name="lucide:layers" class="h-3.5 w-3.5" />
                <span class="absolute -right-1 -bottom-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#0d0e10] text-[9px] font-medium leading-none text-current">+</span>
              </span>
            </button>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <button
              ref="filterMenuButtonRef"
              type="button"
              class="relative flex h-8 w-8 items-center justify-center rounded-full border text-[#8f9198] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              :class="hasCurrentViewFilters || filterMenuOpen ? 'border-white/[0.14] bg-white/[0.075] text-[#f0f1f4]' : 'border-white/[0.08] bg-white/[0.035]'"
              title="Filter"
              @click="toggleFilterMenu"
            >
              <Icon name="lucide:list-filter" class="h-4 w-4" aria-hidden="true" />
              <span v-if="hasCurrentViewFilters" class="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[#4dbb83] ring-2 ring-[#0d0e10]" aria-hidden="true"></span>
            </button>

            <button
              ref="displayOptionsButtonRef"
              type="button"
              class="relative flex h-8 w-8 items-center justify-center rounded-full border text-[#8f9198] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
              :class="hasModifiedDisplayOptions || displayOptionsOpen ? 'border-white/[0.14] bg-white/[0.075] text-[#f0f1f4]' : 'border-white/[0.08] bg-white/[0.035]'"
              title="Display options"
              @click="toggleDisplayOptions"
            >
              <Icon name="lucide:sliders-horizontal" class="h-4 w-4" aria-hidden="true" />
              <span v-if="hasModifiedDisplayOptions" class="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[#4dbb83] ring-2 ring-[#0d0e10]" aria-hidden="true"></span>
            </button>
          </div>
        </div>

        <div
          v-if="customViewContextMenu.open"
          ref="customViewContextMenuRef"
          class="fixed z-50 w-36 overflow-hidden rounded-lg border border-white/[0.08] bg-[#15161a] py-1 shadow-xl shadow-black/40"
          :style="{ left: `${customViewContextMenu.x}px`, top: `${customViewContextMenu.y}px` }"
        >
          <button
            type="button"
            class="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] text-[#d7d8dc] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
            @click="editContextCustomView"
          >
            <Icon name="lucide:square-pen" class="h-3.5 w-3.5 text-[#8f9198]" aria-hidden="true" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            class="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] text-[#e06c75] hover:bg-[#e06c75]/10 hover:text-[#ff8a93]"
            @click="deleteContextCustomView"
          >
            <Icon name="lucide:trash-2" class="h-3.5 w-3.5" aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>

        <ViewEditorCard
          v-if="!selectedTicket && viewEditorDraft"
          :name="viewEditorDraft.name"
          :description="viewEditorDraft.description"
          :save-disabled="viewEditorDraft.name.trim().length === 0"
          @update:name="updateViewEditorName"
          @update:description="updateViewEditorDescription"
          @open-filters="openViewEditorFilters"
          @open-settings="openViewEditorSettings"
          @save="saveViewEditor"
          @cancel="cancelViewEditor"
        />

        <div
          v-if="!selectedTicket && activeFilterChips.length"
          class="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2"
        >
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span
              v-for="filter in activeFilterChips"
              :key="filter.id"
              class="inline-flex h-7 max-w-[18rem] items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.045] px-2 text-[12px] text-[#d7d8dc]"
            >
              <span class="truncate">{{ filter.fieldLabel }}</span>
              <span class="text-[#777a83]">is</span>
              <span class="truncate text-[#f0f1f4]">{{ filter.valueLabel }}</span>
              <button
                type="button"
                class="ml-0.5 flex h-4 w-4 items-center justify-center rounded text-[#777a83] hover:bg-white/[0.08] hover:text-[#f0f1f4]"
                :aria-label="`Remove ${filter.fieldLabel} filter`"
                @click="removeActiveFilterChip(filter)"
              >
                ×
              </button>
            </span>

            <button
              type="button"
              class="flex h-7 w-7 items-center justify-center rounded-md text-[#8f9198] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
              title="Add filter"
              @click="openFilterMenu"
            >
              +
            </button>
          </div>

          <div v-if="!viewEditorMode" class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="rounded-md px-2 py-1 text-[12px] text-[#aeb0b7] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
              @click="clearCurrentViewFilters"
            >
              Reset
            </button>
            <button
              type="button"
              class="rounded-md border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-[12px] text-[#d7d8dc] hover:bg-white/[0.07] hover:text-[#f0f1f4]"
              @click="saveCurrentViewFilters"
            >
              Save
            </button>
          </div>
        </div>

        <div v-if="selectedKey" class="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
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
                  :key="getDisplayedIssueRowKey(ticket)"
                  :ticket="ticket"
                  :selected="focusedIssueKey === getDisplayedIssueRowKey(ticket)"
                  :checked="checkedIssueKeySet.has(getDisplayedIssueRowKey(ticket))"
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
                    <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#e6e7ea]">
                      <Icon name="lucide:rocket" class="h-3.5 w-3.5 shrink-0 text-[#9aa8c7]" aria-hidden="true" />
                      <span class="truncate">{{ project.name }}</span>
                    </span>
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
                  :key="getDisplayedIssueRowKey(ticket)"
                  :ticket="ticket"
                  :selected="focusedIssueKey === getDisplayedIssueRowKey(ticket)"
                  :checked="checkedIssueKeySet.has(getDisplayedIssueRowKey(ticket))"
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
                    <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#e6e7ea]">
                      <Icon name="lucide:rocket" class="h-3.5 w-3.5 shrink-0 text-[#9aa8c7]" aria-hidden="true" />
                      <span class="truncate">{{ project.name }}</span>
                    </span>
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
                <p class="mt-1 text-[12px] text-[#777a83]">Backlog issues will appear here.</p>
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
          <div class="grid border-b border-white/[0.06] px-4 py-2 text-[12px] text-[#777a83]" :style="{ gridTemplateColumns: initiativeGridTemplate }">
            <span>Name</span>
            <span v-if="isInitiativeRowFieldVisible('health')">Health</span>
            <span v-if="isInitiativeRowFieldVisible('lead')">Lead</span>
            <span v-if="isInitiativeRowFieldVisible('projects')">Projects</span>
            <span v-if="isInitiativeRowFieldVisible('issues')">Issues</span>
            <span v-if="isInitiativeRowFieldVisible('updated')">Updated</span>
          </div>

          <div v-if="initiativeRows.length">
            <button
              v-for="initiative in initiativeRows"
              :key="initiative.id"
              type="button"
              class="linear-row grid min-h-12 w-full items-center px-4 py-2 text-left"
              :style="{ gridTemplateColumns: initiativeGridTemplate }"
              @click="handleViewChange('projects')"
            >
              <span class="min-w-0 pr-4">
                <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ initiative.name }}</span>
                <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ initiative.description }}</span>
              </span>

              <span v-if="isInitiativeRowFieldVisible('health')">
                <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="getProjectHealthClass(initiative.health)">
                  {{ initiative.health }}
                </span>
              </span>

              <span v-if="isInitiativeRowFieldVisible('lead')" class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ initiative.lead }}</span>
              <span v-if="isInitiativeRowFieldVisible('projects')" class="text-[12px] text-[#8f9198]">{{ initiative.projectCount }} {{ initiative.projectCount === 1 ? 'project' : 'projects' }}</span>

              <span v-if="isInitiativeRowFieldVisible('issues')" class="pr-5">
                <span class="flex items-center justify-between gap-2 text-[11px] text-[#8f9198]">
                  <span>{{ initiative.completedCount }}/{{ initiative.issueCount }}</span>
                  <span>{{ initiative.progress }}%</span>
                </span>
                <span class="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span class="block h-full rounded-full" :class="getProgressBarClass(initiative.health)" :style="{ width: `${initiative.progress}%` }"></span>
                </span>
              </span>

              <span v-if="isInitiativeRowFieldVisible('updated')" class="truncate text-[12px] text-[#777a83]">{{ getRelativeTimeLabel(initiative.updatedAt) }}</span>
            </button>
          </div>

          <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
            <div class="max-w-sm">
              <p class="text-[13px] font-medium text-[#d7d8dc]">No initiatives found</p>
              <p class="mt-1 text-[12px] text-[#777a83]">Initiatives will appear when projects can be grouped into roadmap work.</p>
            </div>
          </div>
        </div>

        <div v-else-if="isProjectDisplayView" class="min-h-0 flex-1 overflow-y-auto">
          <div class="grid border-b border-white/[0.06] px-4 py-2 text-[12px] text-[#777a83]" :style="{ gridTemplateColumns: projectGridTemplate }">
            <span>Name</span>
            <span v-if="isProjectRowFieldVisible('health')">Health</span>
            <span v-if="isProjectRowFieldVisible('priority')">Priority</span>
            <span v-if="isProjectRowFieldVisible('lead')">Lead</span>
            <span v-if="isProjectRowFieldVisible('targetDate')">Target date</span>
            <span v-if="isProjectRowFieldVisible('issues')">Issues</span>
            <span v-if="isProjectRowFieldVisible('status')">Status</span>
          </div>

          <div v-if="visibleProjectCount > 0">
            <section v-for="section in projectSections" :key="section.id">
              <div v-if="projectGrouping !== 'none'" class="flex h-8 items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[#d7d8dc]"
                  :aria-expanded="!isProjectSectionCollapsed(section)"
                  @click="toggleProjectSection(section)"
                >
                  <Icon
                    name="lucide:chevron-down"
                    class="h-3 w-3 shrink-0 text-[#777a83] transition-transform"
                    :class="isProjectSectionCollapsed(section) ? '-rotate-90' : ''"
                    aria-hidden="true"
                  />
                  <span class="truncate">{{ section.label }}</span>
                  <span class="text-[#6f727b]">{{ section.projects.length }}</span>
                </button>
              </div>

              <template v-if="!isProjectSectionCollapsed(section)">
                <button
                  v-for="project in section.projects"
                  :key="project.key"
                  type="button"
                  class="linear-row grid min-h-12 w-full items-center gap-0 px-4 py-2 text-left"
                  :style="{ gridTemplateColumns: projectGridTemplate }"
                  @mouseenter="prefetchTicket(project.key)"
                  @click="openTicket(project.key)"
                >
                  <span class="min-w-0 pr-4">
                    <span class="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#e6e7ea]">
                      <Icon name="lucide:rocket" class="h-3.5 w-3.5 shrink-0 text-[#9aa8c7]" aria-hidden="true" />
                      <span class="truncate">{{ project.name }}</span>
                    </span>
                    <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ project.key }} · {{ project.spaceName }}</span>
                  </span>

                  <span v-if="isProjectRowFieldVisible('health')">
                    <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="getProjectHealthClass(project.health)">
                      {{ project.health }}
                    </span>
                  </span>

                  <span v-if="isProjectRowFieldVisible('priority')" class="truncate text-[12px] text-[#aeb0b7]">{{ project.priority }}</span>
                  <span v-if="isProjectRowFieldVisible('lead')" class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ project.lead }}</span>
                  <span v-if="isProjectRowFieldVisible('targetDate')" class="truncate text-[12px] text-[#8f9198]">{{ project.targetDate }}</span>

                  <span v-if="isProjectRowFieldVisible('issues')" class="pr-5">
                    <span class="flex items-center justify-between gap-2 text-[11px] text-[#8f9198]">
                      <span>{{ project.completedCount }}/{{ project.issueCount }}</span>
                      <span>{{ project.progress }}%</span>
                    </span>
                    <span class="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <span class="block h-full rounded-full" :class="getProgressBarClass(project.health)" :style="{ width: `${project.progress}%` }"></span>
                    </span>
                  </span>

                  <span v-if="isProjectRowFieldVisible('status')" class="truncate text-[12px] text-[#aeb0b7]">{{ project.status }}</span>
                </button>
              </template>
            </section>
          </div>

          <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
            <div class="max-w-sm">
              <p class="text-[13px] font-medium text-[#d7d8dc]">No projects found</p>
              <p class="mt-1 text-[12px] text-[#777a83]">Projects will appear here when enabled teams have project-level work.</p>
            </div>
          </div>
        </div>

        <div v-else-if="isViewsDirectory" class="min-h-0 flex-1 overflow-y-auto">
          <div class="grid border-b border-white/[0.06] px-4 py-2 text-[12px] text-[#777a83]" :style="{ gridTemplateColumns: savedViewGridTemplate }">
            <span>Name</span>
            <span v-if="isSavedViewRowFieldVisible('type')">Type</span>
            <span v-if="isSavedViewRowFieldVisible('items')">Items</span>
            <span v-if="isSavedViewRowFieldVisible('owner')">Owner</span>
            <span v-if="isSavedViewRowFieldVisible('updated')">Updated</span>
          </div>

          <div v-if="displayedSavedViewRows.length">
            <button
              v-for="row in displayedSavedViewRows"
              :key="row.id"
              type="button"
              class="linear-row grid min-h-12 w-full items-center px-4 py-2 text-left"
              :style="{ gridTemplateColumns: savedViewGridTemplate }"
              @click="handleViewChange(row.viewId)"
            >
              <span class="flex min-w-0 items-center gap-3 pr-4">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.035] text-[12px] text-[#bfc1c8]">{{ row.icon }}</span>
                <span class="min-w-0">
                  <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{ row.name }}</span>
                  <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{ row.description }}</span>
                </span>
              </span>

              <span v-if="isSavedViewRowFieldVisible('type')" class="truncate text-[12px] text-[#aeb0b7]">{{ row.category }}</span>
              <span v-if="isSavedViewRowFieldVisible('items')" class="text-[12px] text-[#8f9198]">{{ row.count }}</span>
              <span v-if="isSavedViewRowFieldVisible('owner')" class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{ row.owner }}</span>
              <span v-if="isSavedViewRowFieldVisible('updated')" class="truncate text-[12px] text-[#777a83]">{{ getRelativeTimeLabel(row.updatedAt) }}</span>
            </button>
          </div>

          <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
            <div class="max-w-sm">
              <p class="text-[13px] font-medium text-[#d7d8dc]">No saved views found</p>
              <p class="mt-1 text-[12px] text-[#777a83]">Create a custom issue or project view to see it here.</p>
            </div>
          </div>
        </div>

        <div v-else-if="isReadyQaView" class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
          <div class="min-w-0 overflow-y-auto">
            <div v-if="hiddenCompletedCount > 0 && completedRange !== 'all'" class="flex h-9 items-center justify-end border-b border-white/[0.06] px-4 text-[12px] text-[#777a83]">
              <button type="button" class="hover:text-[#d7d8dc]" @click="completedRange = 'all'">
                {{ hiddenCompletedCount }} completed hidden by filter options
              </button>
            </div>

            <div v-if="issueSections.length && visibleIssueCount > 0">
              <section v-for="section in issueSections" :key="section.id">
                <div v-if="shouldShowIssueSectionHeader()" class="flex h-8 items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[#d7d8dc]"
                    :aria-expanded="!isIssueSectionCollapsed(section)"
                    @click="toggleIssueSection(section)"
                  >
                    <Icon
                      name="lucide:chevron-down"
                      class="h-3 w-3 shrink-0 text-[#777a83] transition-transform"
                      :class="isIssueSectionCollapsed(section) ? '-rotate-90' : ''"
                      aria-hidden="true"
                    />
                    <span class="truncate">{{ section.label }}</span>
                    <span class="text-[#6f727b]">{{ section.tickets.length }}</span>
                  </button>
                </div>
                <template v-if="!isIssueSectionCollapsed(section)">
                  <IssueRow
                    v-for="ticket in section.tickets"
                    :key="getDisplayedIssueRowKey(ticket)"
                    :ticket="ticket"
                    :selected="focusedIssueKey === getDisplayedIssueRowKey(ticket)"
                    :checked="checkedIssueKeySet.has(getDisplayedIssueRowKey(ticket))"
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
          <div v-if="hiddenCompletedCount > 0 && completedRange !== 'all'" class="flex h-9 items-center justify-end border-b border-white/[0.06] px-4 text-[12px] text-[#777a83]">
            <button type="button" class="hover:text-[#d7d8dc]" @click="completedRange = 'all'">
              {{ hiddenCompletedCount }} completed hidden by filter options
            </button>
          </div>

          <div v-if="issueSections.length && visibleIssueCount > 0">
            <section v-for="section in issueSections" :key="section.id">
              <div v-if="shouldShowIssueSectionHeader()" class="flex h-8 items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[#d7d8dc]"
                  :aria-expanded="!isIssueSectionCollapsed(section)"
                  @click="toggleIssueSection(section)"
                >
                  <Icon
                    name="lucide:chevron-down"
                    class="h-3 w-3 shrink-0 text-[#777a83] transition-transform"
                    :class="isIssueSectionCollapsed(section) ? '-rotate-90' : ''"
                    aria-hidden="true"
                  />
                  <span class="truncate">{{ section.label }}</span>
                  <span class="text-[#6f727b]">{{ section.tickets.length }}</span>
                </button>
              </div>
              <template v-if="!isIssueSectionCollapsed(section)">
                <IssueRow
                  v-for="ticket in section.tickets"
                  :key="getDisplayedIssueRowKey(ticket)"
                  :ticket="ticket"
                  :selected="focusedIssueKey === getDisplayedIssueRowKey(ticket)"
                  :checked="checkedIssueKeySet.has(getDisplayedIssueRowKey(ticket))"
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
                <Icon name="lucide:search" class="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
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
                      <Icon v-if="item.icon === 'search'" name="lucide:search" class="h-3.5 w-3.5" aria-hidden="true" />
                      <template v-else>{{ item.icon ?? '>' }}</template>
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

    <AddSpaceModal
      :open="isAddSpaceModalOpen"
      @close="closeAddSpaceModal"
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
