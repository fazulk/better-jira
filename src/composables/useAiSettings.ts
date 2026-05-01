import { computed, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  fetchAiProviderAvailability,
  fetchAppSettings,
  updateAiConnection,
} from '@/api/settings'
import { APP_SETTINGS_QUERY_KEY } from '@/composables/useSpaceSettings'
import {
  AI_MODEL_CATALOG,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  getDefaultModelForProvider,
  isSupportedModel,
  normalizeAiSettings,
  type AiProvider,
  type AiProviderAvailability,
  type AiSettings,
} from '~/shared/ai'
import {
  getDefaultAppSettings,
  reconcileAppSettings,
  type AppSettings,
  type UpdateAiConnectionInput,
} from '~/shared/settings'

const LEGACY_AI_PROVIDER_STORAGE_KEY = 'jira2.settings.aiProvider'
const LEGACY_AI_MODEL_STORAGE_KEY = 'jira2.settings.aiModel'
const LEGACY_AI_SETTINGS_MIGRATION_KEY = 'jira2.settings.aiSelectionMigratedToAppSettings'
let hasAttemptedLegacyMigration = false

export const AI_PROVIDER_AVAILABILITY_QUERY_KEY: readonly ['ai-provider-availability'] = ['ai-provider-availability']

const FALLBACK_PROVIDER_AVAILABILITY: AiProviderAvailability[] = [
  {
    provider: DEFAULT_AI_PROVIDER,
    available: true,
    detail: 'Cerebras can be selected after saving a local API key.',
  },
]

function getAvailableProviders(providerAvailability: readonly AiProviderAvailability[]): AiProvider[] {
  return providerAvailability
    .filter((entry) => entry.available)
    .map((entry) => entry.provider)
}

function appendProviderIfMissing(providers: readonly AiProvider[], provider: AiProvider): AiProvider[] {
  return providers.includes(provider)
    ? [...providers]
    : [...providers, provider]
}

function getPreferredFallbackProvider(availableProviders: readonly AiProvider[]): AiProvider {
  return availableProviders.includes(DEFAULT_AI_PROVIDER)
    ? DEFAULT_AI_PROVIDER
    : availableProviders[0] ?? DEFAULT_AI_PROVIDER
}

function getCurrentAppSettings(currentSettings: AppSettings | undefined): AppSettings {
  return currentSettings ?? getDefaultAppSettings()
}

function mergeAiSettings(currentSettings: AppSettings | undefined, input: UpdateAiConnectionInput): AppSettings {
  const appSettings = getCurrentAppSettings(currentSettings)

  return reconcileAppSettings({
    ...appSettings,
    ai: {
      hasCerebrasApiKey: input.cerebrasApiKey === undefined
        ? appSettings.ai.hasCerebrasApiKey
        : input.cerebrasApiKey.length > 0,
      provider: input.provider ?? appSettings.ai.provider,
      model: input.model ?? appSettings.ai.model,
    },
  })
}

function readLegacyAiSettings(): AiSettings | null {
  if (typeof window === 'undefined') {
    return null
  }

  const provider = window.localStorage.getItem(LEGACY_AI_PROVIDER_STORAGE_KEY)
  const model = window.localStorage.getItem(LEGACY_AI_MODEL_STORAGE_KEY)

  if (provider === null && model === null) {
    return null
  }

  return normalizeAiSettings(
    provider,
    model,
    DEFAULT_AI_PROVIDER,
    AI_PROVIDERS,
  )
}

function hasLegacyMigrationCompleted(): boolean {
  return typeof window !== 'undefined'
    && window.localStorage.getItem(LEGACY_AI_SETTINGS_MIGRATION_KEY) === 'true'
}

function markLegacyMigrationCompleted(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(LEGACY_AI_SETTINGS_MIGRATION_KEY, 'true')
}

export function useAiSettings() {
  const queryClient = useQueryClient()

  const appSettingsQuery = useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: fetchAppSettings,
  })
  const providerAvailabilityQuery = useQuery({
    queryKey: AI_PROVIDER_AVAILABILITY_QUERY_KEY,
    queryFn: fetchAiProviderAvailability,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const aiSettingsMutation = useMutation({
    mutationFn: updateAiConnection,
  })

  const providerAvailability = computed<AiProviderAvailability[]>(() => (
    providerAvailabilityQuery.data.value?.providers ?? FALLBACK_PROVIDER_AVAILABILITY
  ))
  const availableProviders = computed<AiProvider[]>(() => getAvailableProviders(providerAvailability.value))
  const fallbackProvider = computed<AiProvider>(() => getPreferredFallbackProvider(availableProviders.value))
  const settings = computed<AiSettings>(() => normalizeAiSettings(
    appSettingsQuery.data.value?.ai.provider,
    appSettingsQuery.data.value?.ai.model,
    fallbackProvider.value,
    AI_PROVIDERS,
  ))
  const providers = computed<AiProvider[]>(() => appendProviderIfMissing(availableProviders.value, settings.value.provider))
  const availableModels = computed(() => AI_MODEL_CATALOG[settings.value.provider])

  async function persistAiSettings(input: UpdateAiConnectionInput): Promise<void> {
    const previousSettings = getCurrentAppSettings(queryClient.getQueryData<AppSettings>(APP_SETTINGS_QUERY_KEY))
    const optimisticSettings = mergeAiSettings(previousSettings, input)

    queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, optimisticSettings)

    try {
      const persistedSettings = await aiSettingsMutation.mutateAsync(input)
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, persistedSettings)
    } catch (error) {
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, previousSettings)
      throw error
    }
  }

  async function setProvider(provider: AiProvider): Promise<void> {
    if (!AI_PROVIDERS.includes(provider)) {
      await persistAiSettings({
        provider: fallbackProvider.value,
        model: getDefaultModelForProvider(fallbackProvider.value),
      })
      return
    }

    const nextModel = isSupportedModel(provider, settings.value.model)
      ? settings.value.model
      : getDefaultModelForProvider(provider)

    await persistAiSettings({
      provider,
      model: nextModel,
    })
  }

  async function setModel(model: string): Promise<void> {
    const nextModel = isSupportedModel(settings.value.provider, model)
      ? model
      : getDefaultModelForProvider(settings.value.provider)

    await persistAiSettings({
      model: nextModel,
    })
  }

  watch(
    () => appSettingsQuery.data.value?.ai,
    (storedAiSettings) => {
      if (!storedAiSettings || hasAttemptedLegacyMigration || hasLegacyMigrationCompleted()) {
        return
      }

      hasAttemptedLegacyMigration = true

      const legacyAiSettings = readLegacyAiSettings()
      if (!legacyAiSettings) {
        markLegacyMigrationCompleted()
        return
      }

      const defaultAiSettings = getDefaultAppSettings().ai
      const storedSelectionIsDefault = storedAiSettings.provider === defaultAiSettings.provider
        && storedAiSettings.model === defaultAiSettings.model
      const legacySelectionIsDefault = legacyAiSettings.provider === defaultAiSettings.provider
        && legacyAiSettings.model === defaultAiSettings.model

      if (!storedSelectionIsDefault || legacySelectionIsDefault) {
        markLegacyMigrationCompleted()
        return
      }

      void persistAiSettings(legacyAiSettings)
        .then(markLegacyMigrationCompleted)
        .catch((error: unknown) => {
          console.error('Failed to migrate AI model settings:', error)
        })
    },
    { immediate: true },
  )

  return {
    providers,
    providerAvailability,
    isLoadingProviders: computed(() => providerAvailabilityQuery.isLoading.value),
    providerAvailabilityError: computed(() => providerAvailabilityQuery.error.value),
    settings,
    availableModels,
    setProvider,
    setModel,
  }
}
