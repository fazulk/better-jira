import type { AssistantSettings } from './assistant'
import type { UpdateAssistantSettingsInput } from './settingsTypes'
import {
  getDefaultAssistantSettings,
  isAssistantProvider,
  isAssistantReasoning,
  normalizeAssistantSettings,
} from './assistant'

export { getDefaultAssistantSettings } from './assistant'

export function normalizeAssistantConnectionSettings(value: unknown): AssistantSettings {
  if (typeof value !== 'object' || value === null) {
    return getDefaultAssistantSettings()
  }

  const recordValue: Record<string, unknown> = value
  return normalizeAssistantSettings(recordValue.provider, recordValue.model, recordValue.reasoning)
}

export function normalizeAssistantConnectionUpdate(value: unknown): UpdateAssistantSettingsInput | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const recordValue: Record<string, unknown> = value
  const nextAssistant: UpdateAssistantSettingsInput = {}

  if ('provider' in recordValue && isAssistantProvider(recordValue.provider)) {
    nextAssistant.provider = recordValue.provider
  }

  if ('model' in recordValue && typeof recordValue.model === 'string') {
    nextAssistant.model = recordValue.model
  }

  if ('reasoning' in recordValue && isAssistantReasoning(recordValue.reasoning)) {
    nextAssistant.reasoning = recordValue.reasoning
  }

  return Object.keys(nextAssistant).length > 0 ? nextAssistant : undefined
}
