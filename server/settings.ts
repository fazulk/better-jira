import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  getDefaultAppSettings,
  normalizeAppSettings,
  reconcileAppSettings,
  type AppSettings,
  type UpdateAppSettingsInput,
} from '../shared/settings'
import { getAppDataDir } from './runtimePaths'

const settingsFilePath = resolve(getAppDataDir(), 'settings.json')

interface StoredJiraSettings {
  baseUrl: string
  email: string
  apiToken: string
}

interface StoredAiSettings {
  cerebrasApiKey: string
}

interface StoredAppSettings {
  spaces: AppSettings['spaces']
  filterSpaceKeys: AppSettings['filterSpaceKeys']
  sidebar: AppSettings['sidebar']
  jira: StoredJiraSettings
  ai: StoredAiSettings
}

function ensureSettingsDirectoryExists(): void {
  mkdirSync(dirname(settingsFilePath), { recursive: true })
}

function createDefaultStoredSettings(): StoredAppSettings {
  return {
    ...getDefaultAppSettings(),
    jira: {
      baseUrl: '',
      email: '',
      apiToken: '',
    },
    ai: {
      cerebrasApiKey: '',
    },
  }
}

function normalizeStoredJiraSettings(value: unknown): StoredJiraSettings {
  if (typeof value !== 'object' || value === null) {
    return createDefaultStoredSettings().jira
  }

  const recordValue: Record<string, unknown> = value

  return {
    baseUrl: typeof recordValue.baseUrl === 'string' ? recordValue.baseUrl.trim() : '',
    email: typeof recordValue.email === 'string' ? recordValue.email.trim() : '',
    apiToken: typeof recordValue.apiToken === 'string' ? recordValue.apiToken.trim() : '',
  }
}

function normalizeStoredAiSettings(value: unknown): StoredAiSettings {
  if (typeof value !== 'object' || value === null) {
    return {
      cerebrasApiKey: '',
    }
  }

  const recordValue: Record<string, unknown> = value

  return {
    cerebrasApiKey: typeof recordValue.cerebrasApiKey === 'string' ? recordValue.cerebrasApiKey.trim() : '',
  }
}

function normalizeStoredSettings(value: unknown): StoredAppSettings {
  const normalizedAppSettings = normalizeAppSettings(value)
  const defaultStoredSettings = createDefaultStoredSettings()

  if (typeof value !== 'object' || value === null) {
    return defaultStoredSettings
  }

  const recordValue: Record<string, unknown> = value

  return {
    spaces: normalizedAppSettings.spaces,
    filterSpaceKeys: normalizedAppSettings.filterSpaceKeys,
    sidebar: normalizedAppSettings.sidebar,
    jira: normalizeStoredJiraSettings(recordValue.jira),
    ai: normalizeStoredAiSettings(recordValue.ai),
  }
}

function toPublicAppSettings(settings: StoredAppSettings): AppSettings {
  return reconcileAppSettings({
    spaces: settings.spaces,
    filterSpaceKeys: settings.filterSpaceKeys,
    sidebar: settings.sidebar,
    jira: {
      baseUrl: settings.jira.baseUrl,
      email: settings.jira.email,
      hasApiToken: settings.jira.apiToken.length > 0,
    },
    ai: {
      hasCerebrasApiKey: settings.ai.cerebrasApiKey.length > 0,
    },
  })
}

function writeSettingsFile(settings: StoredAppSettings): void {
  ensureSettingsDirectoryExists()
  writeFileSync(settingsFilePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

function readStoredSettings(): StoredAppSettings {
  if (!existsSync(settingsFilePath)) {
    return createDefaultStoredSettings()
  }

  try {
    const rawSettings = readFileSync(settingsFilePath, 'utf8')
    return normalizeStoredSettings(JSON.parse(rawSettings))
  } catch (error) {
    console.error('Failed to read settings file:', error)
    return createDefaultStoredSettings()
  }
}

export function getStoredJiraSettings(): StoredJiraSettings {
  return readStoredSettings().jira
}

export function getStoredAiSettings(): StoredAiSettings {
  return readStoredSettings().ai
}

export function getAppSettings(): AppSettings {
  return toPublicAppSettings(readStoredSettings())
}

export function updateAppSettings(input: UpdateAppSettingsInput): AppSettings {
  const currentSettings = readStoredSettings()
  const nextSettings = reconcileAppSettings({
    spaces: input.spaces ?? currentSettings.spaces,
    filterSpaceKeys: input.filterSpaceKeys ?? currentSettings.filterSpaceKeys,
    sidebar: {
      ...currentSettings.sidebar,
      ...input.sidebar,
    },
    jira: {
      baseUrl: input.jira?.baseUrl ?? currentSettings.jira.baseUrl,
      email: input.jira?.email ?? currentSettings.jira.email,
      hasApiToken: (input.jira?.apiToken ?? currentSettings.jira.apiToken).length > 0,
    },
    ai: {
      hasCerebrasApiKey: (input.ai?.cerebrasApiKey ?? currentSettings.ai.cerebrasApiKey).length > 0,
    },
  })
  const storedSettings: StoredAppSettings = {
    spaces: nextSettings.spaces,
    filterSpaceKeys: nextSettings.filterSpaceKeys,
    sidebar: nextSettings.sidebar,
    jira: {
      baseUrl: input.jira?.baseUrl ?? currentSettings.jira.baseUrl,
      email: input.jira?.email ?? currentSettings.jira.email,
      apiToken: input.jira?.apiToken ?? currentSettings.jira.apiToken,
    },
    ai: {
      cerebrasApiKey: input.ai?.cerebrasApiKey ?? currentSettings.ai.cerebrasApiKey,
    },
  }

  writeSettingsFile(storedSettings)
  return nextSettings
}
