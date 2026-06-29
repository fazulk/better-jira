import type { AiProvider } from './ai'

export interface AppSpaceSetting {
  key: string
  name: string
  enabled: boolean
  /** Lucide icon name (without the `lucide:` prefix). When absent the key initial is shown. */
  icon?: string
  /** Hex color (e.g. `#d65d5d`) used for the team avatar. */
  color?: string
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
  showSubIssuesRange: string
  showTriageIssuesRange: string
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
export type StatusColors = Record<string, string>

export interface StatusPreferences {
  colors: StatusColors
  order: string[]
}

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

export interface UpdateStatusPreferencesInput {
  colors?: StatusColors
  order?: string[]
}

export interface AppSettings {
  spaces: AppSpaceSetting[]
  filterSpaceKeys: string[]
  sidebar: SidebarSettings
  jira: JiraConnectionSettings
  ai: AiConnectionSettings
  aiInstructionPresets: AiInstructionPresetSetting[]
  labelColors: LabelColors
  statusPreferences: StatusPreferences
}

export interface UpdateAppSettingsInput {
  spaces?: AppSpaceSetting[]
  filterSpaceKeys?: string[]
  sidebar?: UpdateSidebarSettingsInput
  jira?: UpdateJiraConnectionInput
  ai?: UpdateAiConnectionInput
  aiInstructionPresets?: AiInstructionPresetSetting[]
  labelColors?: LabelColors
  statusPreferences?: UpdateStatusPreferencesInput
}

export interface JiraSpaceDirectoryEntry {
  key: string
  name: string
}
