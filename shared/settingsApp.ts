import type {
  AppSettings,
  UpdateAppSettingsInput,
} from './settingsTypes'
import { DEFAULT_AI_PROVIDER, getDefaultModelForProvider } from './ai'
import {
  getDefaultAiConnectionSettings,
  normalizeAiConnectionSettings,
  normalizeAiConnectionUpdate,
  normalizeAiSettingsForApp,
  normalizeJiraConnectionSettings,
  normalizeJiraConnectionUpdate,
} from './settingsConnections'
import {
  normalizeLabelColors,
  normalizeSpaceKeyList,
} from './settingsNormalizers'
import {
  normalizeAiInstructionPresetSettings,
  reconcileAiInstructionPresets,
} from './settingsPresets'
import {
  getDefaultSidebarSettings,
  normalizeSidebarSettings,
  normalizeSidebarSettingsUpdate,
  reconcileSidebarSettings,
} from './settingsSidebar'
import {
  normalizeSpacesFromRecord,
  reconcileSpaceSettings,
} from './settingsSpaces'

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
    ai: getDefaultAiConnectionSettings(),
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
    filterSpaceKeys: settings.filterSpaceKeys.filter(spaceKey => enabledSpaceKeys.has(spaceKey)),
    sidebar: reconcileSidebarSettings(settings.sidebar),
    jira: {
      baseUrl: settings.jira.baseUrl.trim(),
      email: settings.jira.email.trim(),
      hasApiToken: settings.jira.hasApiToken,
    },
    ai: normalizeAiSettingsForApp({
      hasCerebrasApiKey: settings.ai.hasCerebrasApiKey,
      provider: settings.ai.provider ?? DEFAULT_AI_PROVIDER,
      model: settings.ai.model || getDefaultModelForProvider(DEFAULT_AI_PROVIDER),
    }),
    aiInstructionPresets: reconcileAiInstructionPresets(settings.aiInstructionPresets),
    labelColors: normalizeLabelColors(settings.labelColors),
  }
}
