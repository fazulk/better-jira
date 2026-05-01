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
}

export interface AiInstructionPresetSetting {
  id: string
  label: string
  text: string
  enabled: boolean
}

export type SidebarSortBy = 'key' | 'summary' | 'status' | 'priority' | 'assignee' | 'type' | 'createdAt' | 'updatedAt' | 'dueDate' | 'completedAt'
export type SidebarGroupBy = Exclude<SidebarSortBy, 'key'> | 'hierarchy' | 'none'
export type SidebarTicketScope = 'currentSprint' | 'all'

export interface SidebarSettings {
  pinnedTicketKeys: string[]
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
}

export interface UpdateSidebarSettingsInput {
  pinnedTicketKeys?: string[]
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
}

export interface UpdateAppSettingsInput {
  spaces?: AppSpaceSetting[]
  filterSpaceKeys?: string[]
  sidebar?: UpdateSidebarSettingsInput
  jira?: UpdateJiraConnectionInput
  ai?: UpdateAiConnectionInput
  aiInstructionPresets?: AiInstructionPresetSetting[]
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
    }
  }

  const recordValue: Record<string, unknown> = value
  const cerebrasApiKey = normalizeAiValue(recordValue.cerebrasApiKey)

  return {
    hasCerebrasApiKey: recordValue.hasCerebrasApiKey === true || cerebrasApiKey.length > 0,
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

  return Object.keys(nextAi).length > 0 ? nextAi : undefined
}

function getDefaultSidebarSettings(): SidebarSettings {
  return {
    pinnedTicketKeys: [],
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
    },
    aiInstructionPresets: [],
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
    ai: {
      hasCerebrasApiKey: settings.ai.hasCerebrasApiKey,
    },
    aiInstructionPresets: reconcileAiInstructionPresets(settings.aiInstructionPresets),
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
