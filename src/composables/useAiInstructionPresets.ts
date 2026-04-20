import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export interface AiInstructionPreset {
  id: string
  label: string
  text: string
  enabled: boolean
  source: 'server' | 'local'
}

export interface AiInstructionPresetDraft {
  label: string
  text: string
}

const SERVER_ENABLED_KEY = 'jira2.settings.aiInstructionServerEnabledIds'
const LOCAL_PRESETS_KEY = 'jira2.settings.aiInstructionLocalPresets'

const serverInstructionPresets: AiInstructionPreset[] = [
  {
    id: 'write-detailed-spec',
    label: 'Write a detailed spec',
    text: 'Write a detailed technical specification for this ticket, including background context, requirements, and implementation notes.',
    enabled: true,
    source: 'server',
  },
]

function createLocalPresetId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseStringArray(value: string): string[] {
  if (!value) return serverInstructionPresets.map((preset) => preset.id)

  try {
    const parsedValue: unknown = JSON.parse(value)
    if (!Array.isArray(parsedValue)) return serverInstructionPresets.map((preset) => preset.id)

    return parsedValue.filter((item): item is string => typeof item === 'string')
  }
  catch {
    return serverInstructionPresets.map((preset) => preset.id)
  }
}

function parseLocalPresets(value: string): AiInstructionPreset[] {
  if (!value) return []

  try {
    const parsedValue: unknown = JSON.parse(value)
    if (!Array.isArray(parsedValue)) return []

    return parsedValue.flatMap((item): AiInstructionPreset[] => {
      if (!isRecord(item)) return []
      if (typeof item.id !== 'string') return []
      if (typeof item.label !== 'string') return []
      if (typeof item.text !== 'string') return []
      if (typeof item.enabled !== 'boolean') return []

      return [{
        id: item.id,
        label: item.label,
        text: item.text,
        enabled: item.enabled,
        source: 'local',
      }]
    })
  }
  catch {
    return []
  }
}

export function useAiInstructionPresets() {
  const enabledServerPresetIds = useLocalStorage<string[]>(
    SERVER_ENABLED_KEY,
    serverInstructionPresets.map((preset) => preset.id),
    {
      serializer: {
        read: parseStringArray,
        write: (value: string[]): string => JSON.stringify(Array.from(new Set(value))),
      },
    },
  )

  const localInstructionPresets = useLocalStorage<AiInstructionPreset[]>(
    LOCAL_PRESETS_KEY,
    [],
    {
      serializer: {
        read: parseLocalPresets,
        write: (value: AiInstructionPreset[]): string => JSON.stringify(
          value.map((preset) => ({
            id: preset.id,
            label: preset.label,
            text: preset.text,
            enabled: preset.enabled,
          })),
        ),
      },
    },
  )

  const serverPresets = computed<AiInstructionPreset[]>(() => {
    const enabledPresetIds = new Set(enabledServerPresetIds.value)
    return serverInstructionPresets.map((preset) => ({
      ...preset,
      enabled: enabledPresetIds.has(preset.id),
    }))
  })

  const allInstructionPresets = computed<AiInstructionPreset[]>(() => [
    ...serverPresets.value,
    ...localInstructionPresets.value,
  ])

  const visibleInstructionPresets = computed<AiInstructionPreset[]>(() =>
    allInstructionPresets.value.filter((preset) => preset.enabled),
  )

  function togglePresetEnabled(presetId: string): void {
    const serverPreset = serverInstructionPresets.find((preset) => preset.id === presetId)
    if (serverPreset) {
      if (enabledServerPresetIds.value.includes(presetId)) {
        enabledServerPresetIds.value = enabledServerPresetIds.value.filter((id) => id !== presetId)
        return
      }

      enabledServerPresetIds.value = [...enabledServerPresetIds.value, presetId]
      return
    }

    localInstructionPresets.value = localInstructionPresets.value.map((preset) => (
      preset.id === presetId
        ? { ...preset, enabled: !preset.enabled }
        : preset
    ))
  }

  function addLocalPreset(draft: AiInstructionPresetDraft): void {
    localInstructionPresets.value = [
      ...localInstructionPresets.value,
      {
        id: createLocalPresetId(),
        label: draft.label.trim(),
        text: draft.text.trim(),
        enabled: true,
        source: 'local',
      },
    ]
  }

  function updateLocalPreset(presetId: string, draft: AiInstructionPresetDraft): void {
    localInstructionPresets.value = localInstructionPresets.value.map((preset) => (
      preset.id === presetId
        ? {
            ...preset,
            label: draft.label.trim(),
            text: draft.text.trim(),
          }
        : preset
    ))
  }

  function removeLocalPreset(presetId: string): void {
    localInstructionPresets.value = localInstructionPresets.value.filter((preset) => preset.id !== presetId)
  }

  return {
    allInstructionPresets,
    visibleInstructionPresets,
    addLocalPreset,
    removeLocalPreset,
    togglePresetEnabled,
    updateLocalPreset,
  }
}
