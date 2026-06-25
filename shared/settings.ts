import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  getDefaultModelForProvider,
  isAiProvider,
  normalizeAiSettings,
  type AiProvider,
} from './ai'
import { LOCAL_SPACE_KEY, LOCAL_SPACE_NAME } from './localTickets'

export interface AppSpaceSetting {
  key: string
  name: string
  enabled: boolean
}

export interface JiraConnectionSettings {
  baseUrl: string
  email: string
  hasApiToken: boolean
}

export interface AiConnectionSettings {
  hasCerebrasApiKey: boolean
  provider: AiProvider
  model: string
}

export interface AiInstructionPresetSetting {
  id: string
  label: string
  text: string
  enabled: boolean
}

export interface FavoriteViewFilter {
  id: string
  fieldId: string
  fieldLabel: string
  value: string
  valueLabel: string
}

export interface FavoriteView {
  id: string
  filters: FavoriteViewFilter[]
}

export interface CustomViewFilter {
  id: string
  fieldId: string
  fieldLabel: string
  value: string
  valueLabel: string
}

export interface CustomViewDisplay {
  grouping: string
  subGrouping: string
  ordering: string
  groupingDirection: 'asc' | 'desc'
  orderingDirection: 'asc' | 'desc'
  completedRange: string
  showSubIssueContext: boolean
  showSubIssuesRange: string
  showTriageIssuesRange: string
  orderCompletedByRecency: boolean
  showEmptyGroups: boolean
  issueGroupOrders: Record<string, string[]>
  hiddenIssueGroupIds: Record<string, string[]>
  collapsedIssueSectionIds: string[]
  visibleIssueRowFields: string[]
  visibleProjectRowFields: string[]
}

export interface CustomView {
  id: string
  name: string
  description: string
  contextKey: string
  filters: CustomViewFilter[]
  display: CustomViewDisplay
}

export type LabelColors = Record<string, string>

export type SidebarSortBy = 'key' | 'summary' | 'status' | 'priority' | 'assignee' | 'type' | 'createdAt' | 'updatedAt' | 'dueDate' | 'completedAt'
export type SidebarGroupBy = Exclude<SidebarSortBy, 'key'> | 'hierarchy' | 'none'
export type SidebarTicketScope = 'currentSprint' | 'all'

export interface SidebarSettings {
  pinnedTicketKeys: string[]
  favoriteViews: FavoriteView[]
  customViews: CustomView[]
  filterTypeKeys: string[]
  filterStatuses: string[]
  filterAssignees: string[]
  showCompletedTickets: boolean
  ticketScope: SidebarTicketScope
  sortBy: SidebarSortBy
  groupBy: SidebarGroupBy
  sortReversed: boolean
}

export interface UpdateJiraConnectionInput {
  baseUrl?: string
  email?: string
  apiToken?: string
}

export interface UpdateAiConnectionInput {
  cerebrasApiKey?: string
  provider?: AiProvider
  model?: string
}

export interface UpdateSidebarSettingsInput {
  pinnedTicketKeys?: string[]
  favoriteViews?: FavoriteView[]
  customViews?: CustomView[]
  filterTypeKeys?: string[]
  filterStatuses?: string[]
  filterAssignees?: string[]
  showCompletedTickets?: boolean
  ticketScope?: SidebarTicketScope
  sortBy?: SidebarSortBy
  groupBy?: SidebarGroupBy
  sortReversed?: boolean
}

export interface AppSettings {
  spaces: AppSpaceSetting[]
  filterSpaceKeys: string[]
  sidebar: SidebarSettings
  jira: JiraConnectionSettings
  ai: AiConnectionSettings
  aiInstructionPresets: AiInstructionPresetSetting[]
  labelColors: LabelColors
}

export interface UpdateAppSettingsInput {
  spaces?: AppSpaceSetting[]
  filterSpaceKeys?: string[]
  sidebar?: UpdateSidebarSettingsInput
  jira?: UpdateJiraConnectionInput
  ai?: UpdateAiConnectionInput
  aiInstructionPresets?: AiInstructionPresetSetting[]
  labelColors?: LabelColors
}

export interface JiraSpaceDirectoryEntry {
  key: string
  name: string
}

function escapeJqlStringValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function normalizeSpaceKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toUpperCase()
  return normalizedValue.length > 0 ? normalizedValue : null
}

function normalizeSpaceName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeJiraValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeAiValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeAiInstructionValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLabelColorKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeLabelColorValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalizedValue) ? normalizedValue : null
}

function normalizeLabelColors(value: unknown): LabelColors {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const recordValue: Record<string, unknown> = value
  const normalizedColors: LabelColors = {}

  for (const [label, color] of Object.entries(recordValue)) {
    const normalizedLabel = normalizeLabelColorKey(label)
    const normalizedColor = normalizeLabelColorValue(color)

    if (normalizedLabel && normalizedColor) {
      normalizedColors[normalizedLabel] = normalizedColor
    }
  }

  return normalizedColors
}

function normalizeSpaceKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalizedValues = new Set<string>()

  for (const entry of value) {
    const normalizedEntry = normalizeSpaceKey(entry)
    if (normalizedEntry) {
      normalizedValues.add(normalizedEntry)
    }
  }

  return [...normalizedValues]
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value !== 'string') {
      return []
    }

    const normalizedValue = value.trim()
    return normalizedValue.length > 0 ? [normalizedValue] : []
  }

  const normalizedValues = new Set<string>()

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue
    }

    const normalizedEntry = entry.trim()
    if (normalizedEntry.length > 0) {
      normalizedValues.add(normalizedEntry)
    }
  }

  return [...normalizedValues]
}

function normalizeStringListRecord(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const recordValue: Record<string, unknown> = value
  const normalizedRecord: Record<string, string[]> = {}

  for (const [key, entry] of Object.entries(recordValue)) {
    const normalizedKey = key.trim()
    if (!normalizedKey) {
      continue
    }

    const normalizedList = normalizeStringList(entry)
    if (normalizedList.length > 0) {
      normalizedRecord[normalizedKey] = normalizedList
    }
  }

  return normalizedRecord
}

function normalizeFavoriteViewFilter(value: unknown): FavoriteViewFilter | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const recordValue: Record<string, unknown> = value
  const id = typeof recordValue.id === 'string' ? recordValue.id.trim() : ''
  const fieldId = typeof recordValue.fieldId === 'string' ? recordValue.fieldId.trim() : ''
  const fieldLabel = typeof recordValue.fieldLabel === 'string' ? recordValue.fieldLabel.trim() : ''
  const filterValue = typeof recordValue.value === 'string' ? recordValue.value.trim() : ''
  const valueLabel = typeof recordValue.valueLabel === 'string' ? recordValue.valueLabel.trim() : ''

  if (!id || !fieldId || !fieldLabel || !filterValue || !valueLabel) {
    return null
  }

  return {
    id,
    fieldId,
    fieldLabel,
    value: filterValue,
    valueLabel,
  }
}

function normalizeFavoriteViews(value: unknown): FavoriteView[] {
  if (!Array.isArray(value)) {
    return []
  }

  const favoriteViewsById = new Map<string, FavoriteView>()

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const recordValue: Record<string, unknown> = entry
    const id = typeof recordValue.id === 'string' ? recordValue.id.trim() : ''

    if (!id || favoriteViewsById.has(id)) {
      continue
    }

    const filters = Array.isArray(recordValue.filters)
      ? recordValue.filters
        .map(normalizeFavoriteViewFilter)
        .filter((filter): filter is FavoriteViewFilter => filter !== null)
      : []

    favoriteViewsById.set(id, {
      id,
      filters,
    })
  }

  return [...favoriteViewsById.values()]
}

function getDefaultCustomViewDisplay(): CustomViewDisplay {
  return {
    grouping: 'none',
    subGrouping: 'none',
    ordering: 'status',
    groupingDirection: 'asc',
    orderingDirection: 'asc',
    completedRange: 'hidden',
    showSubIssueContext: true,
    showSubIssuesRange: 'all',
    showTriageIssuesRange: 'all',
    orderCompletedByRecency: false,
    showEmptyGroups: false,
    issueGroupOrders: {},
    hiddenIssueGroupIds: {},
    collapsedIssueSectionIds: [],
    visibleIssueRowFields: ['id', 'status', 'assignee', 'priority', 'project', 'due', 'labels', 'created'],
    visibleProjectRowFields: ['health', 'priority', 'lead', 'targetDate', 'issues', 'status'],
  }
}

function normalizeDirectionValue(value: unknown): 'asc' | 'desc' {
  return value === 'desc' ? 'desc' : 'asc'
}

function normalizeCustomViewDisplay(value: unknown): CustomViewDisplay {
  const defaults = getDefaultCustomViewDisplay()

  if (typeof value !== 'object' || value === null) {
    return defaults
  }

  const recordValue: Record<string, unknown> = value
  const visibleIssueRowFields = normalizeStringList(recordValue.visibleIssueRowFields)
  const visibleProjectRowFields = normalizeStringList(recordValue.visibleProjectRowFields)

  return {
    grouping: typeof recordValue.grouping === 'string' && recordValue.grouping.trim() ? recordValue.grouping.trim() : defaults.grouping,
    subGrouping: typeof recordValue.subGrouping === 'string' && recordValue.subGrouping.trim() ? recordValue.subGrouping.trim() : defaults.subGrouping,
    ordering: typeof recordValue.ordering === 'string' && recordValue.ordering.trim() ? recordValue.ordering.trim() : defaults.ordering,
    groupingDirection: normalizeDirectionValue(recordValue.groupingDirection),
    orderingDirection: normalizeDirectionValue(recordValue.orderingDirection),
    completedRange: typeof recordValue.completedRange === 'string' && recordValue.completedRange.trim() ? recordValue.completedRange.trim() : defaults.completedRange,
    showSubIssueContext: normalizeBoolean(recordValue.showSubIssueContext, defaults.showSubIssueContext),
    showSubIssuesRange: typeof recordValue.showSubIssuesRange === 'string' && recordValue.showSubIssuesRange.trim() ? recordValue.showSubIssuesRange.trim() : defaults.showSubIssuesRange,
    showTriageIssuesRange: typeof recordValue.showTriageIssuesRange === 'string' && recordValue.showTriageIssuesRange.trim() ? recordValue.showTriageIssuesRange.trim() : defaults.showTriageIssuesRange,
    orderCompletedByRecency: normalizeBoolean(recordValue.orderCompletedByRecency, defaults.orderCompletedByRecency),
    showEmptyGroups: normalizeBoolean(recordValue.showEmptyGroups, defaults.showEmptyGroups),
    issueGroupOrders: normalizeStringListRecord(recordValue.issueGroupOrders),
    hiddenIssueGroupIds: normalizeStringListRecord(recordValue.hiddenIssueGroupIds),
    collapsedIssueSectionIds: normalizeStringList(recordValue.collapsedIssueSectionIds),
    visibleIssueRowFields: visibleIssueRowFields.length > 0 ? visibleIssueRowFields : defaults.visibleIssueRowFields,
    visibleProjectRowFields: visibleProjectRowFields.length > 0 ? visibleProjectRowFields : defaults.visibleProjectRowFields,
  }
}

function normalizeCustomViewFilter(value: unknown): CustomViewFilter | null {
  const filter = normalizeFavoriteViewFilter(value)
  if (!filter) {
    return null
  }

  return {
    id: filter.id,
    fieldId: filter.fieldId,
    fieldLabel: filter.fieldLabel,
    value: filter.value,
    valueLabel: filter.valueLabel,
  }
}

function normalizeCustomViews(value: unknown): CustomView[] {
  if (!Array.isArray(value)) {
    return []
  }

  const customViewsById = new Map<string, CustomView>()

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const recordValue: Record<string, unknown> = entry
    const id = typeof recordValue.id === 'string' ? recordValue.id.trim() : ''
    const name = typeof recordValue.name === 'string' ? recordValue.name.trim() : ''
    const contextKey = typeof recordValue.contextKey === 'string' ? recordValue.contextKey.trim() : ''

    if (!id || !name || !contextKey || customViewsById.has(id)) {
      continue
    }

    const filters = Array.isArray(recordValue.filters)
      ? recordValue.filters
        .map(normalizeCustomViewFilter)
        .filter((filter): filter is CustomViewFilter => filter !== null)
      : []

    customViewsById.set(id, {
      id,
      name,
      description: typeof recordValue.description === 'string' ? recordValue.description.trim() : '',
      contextKey,
      filters,
      display: normalizeCustomViewDisplay(recordValue.display),
    })
  }

  return [...customViewsById.values()]
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeSidebarSortBy(value: unknown): SidebarSortBy {
  switch (value) {
    case 'summary':
    case 'status':
    case 'priority':
    case 'assignee':
    case 'type':
    case 'createdAt':
    case 'updatedAt':
    case 'dueDate':
    case 'completedAt':
      return value
    case 'key':
    default:
      return 'key'
  }
}

function normalizeSidebarGroupBy(value: unknown): SidebarGroupBy {
  switch (value) {
    case 'summary':
    case 'status':
    case 'priority':
    case 'assignee':
    case 'type':
    case 'createdAt':
    case 'updatedAt':
    case 'dueDate':
    case 'completedAt':
    case 'none':
      return value
    case 'hierarchy':
    default:
      return 'hierarchy'
  }
}

function normalizeSidebarTicketScope(value: unknown): SidebarTicketScope {
  return value === 'currentSprint' ? 'currentSprint' : 'all'
}

function normalizeSpaceSetting(value: unknown): AppSpaceSetting | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const recordValue: Record<string, unknown> = value
  const key = normalizeSpaceKey(recordValue.key)

  if (!key) {
    return null
  }

  return {
    key,
    name: normalizeSpaceName(recordValue.name),
    enabled: recordValue.enabled !== false,
  }
}

function normalizeSpaceSettings(value: unknown): AppSpaceSetting[] {
  if (!Array.isArray(value)) {
    return []
  }

  const spaces: AppSpaceSetting[] = []

  for (const entry of value) {
    const normalizedEntry = normalizeSpaceSetting(entry)
    if (normalizedEntry) {
      spaces.push(normalizedEntry)
    }
  }

  return spaces
}

function createLegacySpaceSettings(keys: string[], enabled: boolean): AppSpaceSetting[] {
  return keys.map((key) => ({
    key,
    name: key,
    enabled,
  }))
}

function sortSpaceSettings(left: AppSpaceSetting, right: AppSpaceSetting): number {
  const leftDisplayName = left.name || left.key
  const rightDisplayName = right.name || right.key
  const nameCompare = leftDisplayName.localeCompare(rightDisplayName, undefined, { sensitivity: 'base' })

  if (nameCompare !== 0) {
    return nameCompare
  }

  return left.key.localeCompare(right.key, undefined, { sensitivity: 'base' })
}

function reconcileSpaceSettings(spaces: AppSpaceSetting[]): AppSpaceSetting[] {
  const dedupedSpaces = new Map<string, AppSpaceSetting>()

  for (const space of spaces) {
    const existingSpace = dedupedSpaces.get(space.key)

    if (!existingSpace) {
      dedupedSpaces.set(space.key, {
        key: space.key,
        name: space.name,
        enabled: space.enabled,
      })
      continue
    }

    dedupedSpaces.set(space.key, {
      key: existingSpace.key,
      name: existingSpace.name || space.name,
      enabled: existingSpace.enabled || space.enabled,
    })
  }

  const sorted = [...dedupedSpaces.values()].sort(sortSpaceSettings)

  if (!sorted.some(space => space.key === LOCAL_SPACE_KEY)) {
    sorted.push({
      key: LOCAL_SPACE_KEY,
      name: LOCAL_SPACE_NAME,
      enabled: true,
    })
    sorted.sort(sortSpaceSettings)
  }

  return sorted
}

function normalizeSpacesFromRecord(recordValue: Record<string, unknown>): AppSpaceSetting[] {
  const spaces = normalizeSpaceSettings(recordValue.spaces)
  const visibleSpaceKeys = normalizeSpaceKeyList(recordValue.visibleSpaceKeys)
  const hiddenSpaceKeys = normalizeSpaceKeyList(recordValue.hiddenSpaceKeys)

  return [
    ...spaces,
    ...createLegacySpaceSettings(visibleSpaceKeys, true),
    ...createLegacySpaceSettings(hiddenSpaceKeys, false),
  ]
}

function normalizeJiraConnectionSettings(value: unknown): JiraConnectionSettings {
  if (typeof value !== 'object' || value === null) {
    return {
      baseUrl: '',
      email: '',
      hasApiToken: false,
    }
  }

  const recordValue: Record<string, unknown> = value
  const apiToken = normalizeJiraValue(recordValue.apiToken)

  return {
    baseUrl: normalizeJiraValue(recordValue.baseUrl),
    email: normalizeJiraValue(recordValue.email),
    hasApiToken: recordValue.hasApiToken === true || apiToken.length > 0,
  }
}

function normalizeJiraConnectionUpdate(value: unknown): UpdateJiraConnectionInput | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const recordValue: Record<string, unknown> = value
  const nextJira: UpdateJiraConnectionInput = {}

  if ('baseUrl' in recordValue) {
    nextJira.baseUrl = normalizeJiraValue(recordValue.baseUrl)
  }

  if ('email' in recordValue) {
    nextJira.email = normalizeJiraValue(recordValue.email)
  }

  if ('apiToken' in recordValue) {
    nextJira.apiToken = normalizeJiraValue(recordValue.apiToken)
  }

  return Object.keys(nextJira).length > 0 ? nextJira : undefined
}

function normalizeAiConnectionSettings(value: unknown): AiConnectionSettings {
  if (typeof value !== 'object' || value === null) {
    return {
      hasCerebrasApiKey: false,
      provider: DEFAULT_AI_PROVIDER,
      model: getDefaultModelForProvider(DEFAULT_AI_PROVIDER),
    }
  }

  const recordValue: Record<string, unknown> = value
  const cerebrasApiKey = normalizeAiValue(recordValue.cerebrasApiKey)
  const aiSettings = normalizeAiSettings(recordValue.provider, recordValue.model)

  return {
    hasCerebrasApiKey: recordValue.hasCerebrasApiKey === true || cerebrasApiKey.length > 0,
    provider: aiSettings.provider,
    model: aiSettings.model,
  }
}

function normalizeAiConnectionUpdate(value: unknown): UpdateAiConnectionInput | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const recordValue: Record<string, unknown> = value
  const nextAi: UpdateAiConnectionInput = {}

  if ('cerebrasApiKey' in recordValue) {
    nextAi.cerebrasApiKey = normalizeAiValue(recordValue.cerebrasApiKey)
  }

  if ('provider' in recordValue && isAiProvider(recordValue.provider)) {
    nextAi.provider = recordValue.provider
  }

  if ('model' in recordValue && typeof recordValue.model === 'string') {
    nextAi.model = normalizeAiValue(recordValue.model)
  }

  return Object.keys(nextAi).length > 0 ? nextAi : undefined
}

function getDefaultSidebarSettings(): SidebarSettings {
  return {
    pinnedTicketKeys: [],
    favoriteViews: [],
    customViews: [],
    filterTypeKeys: [],
    filterStatuses: [],
    filterAssignees: [],
    showCompletedTickets: false,
    ticketScope: 'all',
    sortBy: 'key',
    groupBy: 'hierarchy',
    sortReversed: false,
  }
}

function normalizeSidebarSettings(value: unknown): SidebarSettings {
  const defaults = getDefaultSidebarSettings()

  if (typeof value !== 'object' || value === null) {
    return defaults
  }

  const recordValue: Record<string, unknown> = value

  return {
    pinnedTicketKeys: normalizeStringList(recordValue.pinnedTicketKeys),
    favoriteViews: normalizeFavoriteViews(recordValue.favoriteViews),
    customViews: normalizeCustomViews(recordValue.customViews),
    filterTypeKeys: normalizeStringList(recordValue.filterTypeKeys),
    filterStatuses: normalizeStringList(recordValue.filterStatuses),
    filterAssignees: normalizeStringList(recordValue.filterAssignees),
    showCompletedTickets: normalizeBoolean(recordValue.showCompletedTickets, defaults.showCompletedTickets),
    ticketScope: normalizeSidebarTicketScope(recordValue.ticketScope),
    sortBy: normalizeSidebarSortBy(recordValue.sortBy),
    groupBy: normalizeSidebarGroupBy(recordValue.groupBy),
    sortReversed: normalizeBoolean(recordValue.sortReversed, defaults.sortReversed),
  }
}

function normalizeAiInstructionPresetSetting(value: unknown): AiInstructionPresetSetting | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const recordValue: Record<string, unknown> = value
  const id = normalizeAiInstructionValue(recordValue.id)
  const label = normalizeAiInstructionValue(recordValue.label)
  const text = normalizeAiInstructionValue(recordValue.text)

  if (!id || !label || !text) {
    return null
  }

  return {
    id,
    label,
    text,
    enabled: recordValue.enabled !== false,
  }
}

function normalizeAiInstructionPresetSettings(value: unknown): AiInstructionPresetSetting[] {
  if (!Array.isArray(value)) {
    return []
  }

  const presetsById = new Map<string, AiInstructionPresetSetting>()

  for (const entry of value) {
    const preset = normalizeAiInstructionPresetSetting(entry)
    if (preset && !presetsById.has(preset.id)) {
      presetsById.set(preset.id, preset)
    }
  }

  return [...presetsById.values()]
}

function normalizeSidebarSettingsUpdate(value: unknown): UpdateSidebarSettingsInput | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const recordValue: Record<string, unknown> = value
  const nextSidebar: UpdateSidebarSettingsInput = {}

  if ('pinnedTicketKeys' in recordValue) {
    nextSidebar.pinnedTicketKeys = normalizeStringList(recordValue.pinnedTicketKeys)
  }

  if ('favoriteViews' in recordValue) {
    nextSidebar.favoriteViews = normalizeFavoriteViews(recordValue.favoriteViews)
  }

  if ('customViews' in recordValue) {
    nextSidebar.customViews = normalizeCustomViews(recordValue.customViews)
  }

  if ('filterTypeKeys' in recordValue) {
    nextSidebar.filterTypeKeys = normalizeStringList(recordValue.filterTypeKeys)
  }

  if ('filterStatuses' in recordValue) {
    nextSidebar.filterStatuses = normalizeStringList(recordValue.filterStatuses)
  }

  if ('filterAssignees' in recordValue) {
    nextSidebar.filterAssignees = normalizeStringList(recordValue.filterAssignees)
  }

  if ('showCompletedTickets' in recordValue) {
    nextSidebar.showCompletedTickets = normalizeBoolean(recordValue.showCompletedTickets, false)
  }

  if ('ticketScope' in recordValue) {
    nextSidebar.ticketScope = normalizeSidebarTicketScope(recordValue.ticketScope)
  }

  if ('sortBy' in recordValue) {
    nextSidebar.sortBy = normalizeSidebarSortBy(recordValue.sortBy)
  }

  if ('groupBy' in recordValue) {
    nextSidebar.groupBy = normalizeSidebarGroupBy(recordValue.groupBy)
  }

  if ('sortReversed' in recordValue) {
    nextSidebar.sortReversed = normalizeBoolean(recordValue.sortReversed, false)
  }

  return Object.keys(nextSidebar).length > 0 ? nextSidebar : undefined
}

function reconcileSidebarSettings(sidebar: SidebarSettings): SidebarSettings {
  return {
    pinnedTicketKeys: normalizeStringList(sidebar.pinnedTicketKeys),
    favoriteViews: normalizeFavoriteViews(sidebar.favoriteViews),
    customViews: normalizeCustomViews(sidebar.customViews),
    filterTypeKeys: normalizeStringList(sidebar.filterTypeKeys),
    filterStatuses: normalizeStringList(sidebar.filterStatuses),
    filterAssignees: normalizeStringList(sidebar.filterAssignees),
    showCompletedTickets: sidebar.showCompletedTickets,
    ticketScope: normalizeSidebarTicketScope(sidebar.ticketScope),
    sortBy: normalizeSidebarSortBy(sidebar.sortBy),
    groupBy: normalizeSidebarGroupBy(sidebar.groupBy),
    sortReversed: sidebar.sortReversed,
  }
}

function reconcileAiInstructionPresets(presets: AiInstructionPresetSetting[]): AiInstructionPresetSetting[] {
  return normalizeAiInstructionPresetSettings(presets)
}

function normalizeAiSettingsForApp(settings: AiConnectionSettings): AiConnectionSettings {
  const aiSettings = normalizeAiSettings(
    settings.provider,
    settings.model,
    DEFAULT_AI_PROVIDER,
    AI_PROVIDERS,
  )

  return {
    hasCerebrasApiKey: settings.hasCerebrasApiKey,
    provider: aiSettings.provider,
    model: aiSettings.model,
  }
}

export function getDefaultAppSettings(): AppSettings {
  return {
    spaces: [],
    filterSpaceKeys: [],
    sidebar: getDefaultSidebarSettings(),
    jira: {
      baseUrl: '',
      email: '',
      hasApiToken: false,
    },
    ai: {
      hasCerebrasApiKey: false,
      provider: DEFAULT_AI_PROVIDER,
      model: getDefaultModelForProvider(DEFAULT_AI_PROVIDER),
    },
    aiInstructionPresets: [],
    labelColors: {},
  }
}

export function normalizeAppSettings(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null) {
    return getDefaultAppSettings()
  }

  const recordValue: Record<string, unknown> = value

  return reconcileAppSettings({
    spaces: normalizeSpacesFromRecord(recordValue),
    filterSpaceKeys: normalizeSpaceKeyList(recordValue.filterSpaceKeys),
    sidebar: normalizeSidebarSettings(recordValue.sidebar),
    jira: normalizeJiraConnectionSettings(recordValue.jira),
    ai: normalizeAiConnectionSettings(recordValue.ai),
    aiInstructionPresets: normalizeAiInstructionPresetSettings(recordValue.aiInstructionPresets),
    labelColors: normalizeLabelColors(recordValue.labelColors),
  })
}

export function normalizeAppSettingsUpdate(value: unknown): UpdateAppSettingsInput {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const recordValue: Record<string, unknown> = value
  const nextSettings: UpdateAppSettingsInput = {}
  const nextSpaces = normalizeSpacesFromRecord(recordValue)

  if (nextSpaces.length > 0 || 'spaces' in recordValue || 'visibleSpaceKeys' in recordValue || 'hiddenSpaceKeys' in recordValue) {
    nextSettings.spaces = nextSpaces
  }

  if ('filterSpaceKeys' in recordValue) {
    nextSettings.filterSpaceKeys = normalizeSpaceKeyList(recordValue.filterSpaceKeys)
  }

  const nextSidebar = normalizeSidebarSettingsUpdate(recordValue.sidebar)
  if (nextSidebar) {
    nextSettings.sidebar = nextSidebar
  }

  const nextJira = normalizeJiraConnectionUpdate(recordValue.jira)
  if (nextJira) {
    nextSettings.jira = nextJira
  }

  const nextAi = normalizeAiConnectionUpdate(recordValue.ai)
  if (nextAi) {
    nextSettings.ai = nextAi
  }

  if ('aiInstructionPresets' in recordValue) {
    nextSettings.aiInstructionPresets = normalizeAiInstructionPresetSettings(recordValue.aiInstructionPresets)
  }

  if ('labelColors' in recordValue) {
    nextSettings.labelColors = normalizeLabelColors(recordValue.labelColors)
  }

  return nextSettings
}

export function reconcileAppSettings(settings: AppSettings): AppSettings {
  const spaces = reconcileSpaceSettings(settings.spaces)
  const enabledSpaceKeys = new Set(
    spaces
      .filter(space => space.enabled)
      .map(space => space.key),
  )

  return {
    spaces,
    filterSpaceKeys: settings.filterSpaceKeys.filter((spaceKey) => enabledSpaceKeys.has(spaceKey)),
    sidebar: reconcileSidebarSettings(settings.sidebar),
    jira: {
      baseUrl: settings.jira.baseUrl.trim(),
      email: settings.jira.email.trim(),
      hasApiToken: settings.jira.hasApiToken,
    },
    ai: normalizeAiSettingsForApp(settings.ai),
    aiInstructionPresets: reconcileAiInstructionPresets(settings.aiInstructionPresets),
    labelColors: normalizeLabelColors(settings.labelColors),
  }
}

export function hasConfiguredJiraCredentials(settings: Pick<AppSettings, 'jira'>): boolean {
  return (
    settings.jira.baseUrl.length > 0
    && settings.jira.email.length > 0
    && settings.jira.hasApiToken
  )
}

export function buildEnabledSpaceSearchQuery(spaceKeys: readonly string[]): string | null {
  const normalizedSpaceKeys = [...new Set(
    spaceKeys
      .map(spaceKey => normalizeSpaceKey(spaceKey))
      .filter((spaceKey): spaceKey is string => spaceKey !== null && spaceKey !== LOCAL_SPACE_KEY),
  )]

  if (normalizedSpaceKeys.length === 0) {
    return null
  }

  const projectKeys = normalizedSpaceKeys
    .map(escapeJqlStringValue)
    .map(spaceKey => `"${spaceKey}"`)
    .join(', ')

  return `project in (${projectKeys}) ORDER BY updated DESC`
}

export function buildUpdatedSinceSearchQuery(baseQuery: string, updatedSince: Date): string {
  const queryWithoutOrder = baseQuery.replace(/\s+ORDER\s+BY\s+updated\s+DESC\s*$/i, '').trim()
  const elapsedMs = Math.max(0, Date.now() - updatedSince.getTime())
  const elapsedMinutes = Math.ceil(elapsedMs / 60_000)
  const overlapWindowMinutes = Math.max(1, elapsedMinutes + 1)
  const updatedSinceClause = `updated >= "-${overlapWindowMinutes}m"`
  return `${queryWithoutOrder} AND ${updatedSinceClause} ORDER BY updated DESC`
}
