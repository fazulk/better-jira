import { computed, onMounted, watch } from 'vue'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import type { AiInstructionPresetSetting } from '~/shared/settings'

export interface AiInstructionPreset {
  id: string
  label: string
  text: string
  enabled: boolean
  source: 'local'
}

export interface AiInstructionPresetDraft {
  label: string
  text: string
}

const LEGACY_LOCAL_PRESETS_KEY = 'jira2.settings.aiInstructionLocalPresets'
const LEGACY_MIGRATION_COMPLETE_KEY = 'jira2.settings.aiInstructionLocalPresetsMigratedToAppSettings'

function createLocalPresetId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizePresetSetting(value: unknown): AiInstructionPresetSetting | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string') return null
  if (typeof value.label !== 'string') return null
  if (typeof value.text !== 'string') return null

  const id = value.id.trim()
  const label = value.label.trim()
  const text = value.text.trim()

  if (!id || !label || !text) return null

  return {
    id,
    label,
    text,
    enabled: value.enabled !== false,
  }
}

function parseLegacyLocalPresets(value: string | null): AiInstructionPresetSetting[] {
  if (!value) return []

  try {
    const parsedValue: unknown = JSON.parse(value)
    if (!Array.isArray(parsedValue)) return []

    return parsedValue.flatMap((item): AiInstructionPresetSetting[] => {
      const preset = normalizePresetSetting(item)
      return preset ? [preset] : []
    })
  }
  catch {
    return []
  }
}

function mergePresetSettings(
  currentPresets: readonly AiInstructionPresetSetting[],
  legacyPresets: readonly AiInstructionPresetSetting[],
): AiInstructionPresetSetting[] {
  const mergedPresets = new Map<string, AiInstructionPresetSetting>()

  for (const preset of currentPresets) {
    mergedPresets.set(preset.id, preset)
  }

  for (const preset of legacyPresets) {
    if (!mergedPresets.has(preset.id)) {
      mergedPresets.set(preset.id, preset)
    }
  }

  return [...mergedPresets.values()]
}

function toInstructionPreset(preset: AiInstructionPresetSetting): AiInstructionPreset {
  return {
    ...preset,
    source: 'local',
  }
}

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function useAiInstructionPresets() {
  const {
    settings,
    isLoading,
    setAiInstructionPresets,
  } = useSpaceSettings()

  const allInstructionPresets = computed<AiInstructionPreset[]>(() =>
    settings.value.aiInstructionPresets.map(toInstructionPreset),
  )

  const visibleInstructionPresets = computed<AiInstructionPreset[]>(() =>
    allInstructionPresets.value.filter((preset) => preset.enabled),
  )

  function persistInstructionPresets(nextPresets: AiInstructionPresetSetting[]): void {
    void setAiInstructionPresets(nextPresets).catch((error: unknown) => {
      console.error('Failed to save AI instruction presets:', error)
    })
  }

  function togglePresetEnabled(presetId: string): void {
    persistInstructionPresets(settings.value.aiInstructionPresets.map((preset) => (
      preset.id === presetId
        ? { ...preset, enabled: !preset.enabled }
        : preset
    )))
  }

  function addLocalPreset(draft: AiInstructionPresetDraft): void {
    persistInstructionPresets([
      ...settings.value.aiInstructionPresets,
      {
        id: createLocalPresetId(),
        label: draft.label.trim(),
        text: draft.text.trim(),
        enabled: true,
      },
    ])
  }

  function updateLocalPreset(presetId: string, draft: AiInstructionPresetDraft): void {
    persistInstructionPresets(settings.value.aiInstructionPresets.map((preset) => (
      preset.id === presetId
        ? {
            ...preset,
            label: draft.label.trim(),
            text: draft.text.trim(),
          }
        : preset
    )))
  }

  function removeLocalPreset(presetId: string): void {
    persistInstructionPresets(settings.value.aiInstructionPresets.filter((preset) => preset.id !== presetId))
  }

  onMounted(() => {
    let hasAttemptedMigration = false

    watch(
      isLoading,
      (settingsAreLoading) => {
        if (settingsAreLoading || hasAttemptedMigration || !hasBrowserStorage()) {
          return
        }

        hasAttemptedMigration = true

        const migrationComplete = window.localStorage.getItem(LEGACY_MIGRATION_COMPLETE_KEY) === 'true'
        const legacyPresets = migrationComplete
          ? []
          : parseLegacyLocalPresets(window.localStorage.getItem(LEGACY_LOCAL_PRESETS_KEY))

        if (legacyPresets.length === 0) {
          window.localStorage.setItem(LEGACY_MIGRATION_COMPLETE_KEY, 'true')
          return
        }

        const nextPresets = mergePresetSettings(settings.value.aiInstructionPresets, legacyPresets)
        void setAiInstructionPresets(nextPresets)
          .then(() => {
            window.localStorage.setItem(LEGACY_MIGRATION_COMPLETE_KEY, 'true')
          })
          .catch((error: unknown) => {
            hasAttemptedMigration = false
            console.error('Failed to migrate AI instruction presets:', error)
          })
      },
      { immediate: true },
    )
  })

  return {
    allInstructionPresets,
    visibleInstructionPresets,
    addLocalPreset,
    removeLocalPreset,
    togglePresetEnabled,
    updateLocalPreset,
  }
}
