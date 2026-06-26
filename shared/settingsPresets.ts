import { normalizeAiInstructionValue } from './settingsNormalizers'
import type { AiInstructionPresetSetting } from './settingsTypes'

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

export function normalizeAiInstructionPresetSettings(value: unknown): AiInstructionPresetSetting[] {
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

export function reconcileAiInstructionPresets(presets: AiInstructionPresetSetting[]): AiInstructionPresetSetting[] {
  return normalizeAiInstructionPresetSettings(presets)
}
