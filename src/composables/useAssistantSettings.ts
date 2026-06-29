import type { AiProviderAvailability } from '~/shared/ai'
import type { AssistantProvider, AssistantReasoning, AssistantSettings } from '~/shared/assistant'
import type { AppSettings, UpdateAssistantSettingsInput } from '~/shared/settings'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import {
  fetchAiProviderAvailability,
  fetchAppSettings,
  updateAssistantConnection,
} from '@/api/settings'
import { AI_PROVIDER_AVAILABILITY_QUERY_KEY } from '@/composables/useAiSettings'
import { APP_SETTINGS_QUERY_KEY } from '@/composables/useSpaceSettings'
import {
  ASSISTANT_PROVIDERS,
  getAssistantModelsForProvider,
  getDefaultAssistantModel,
  isSupportedAssistantModel,
  normalizeAssistantSettings,
} from '~/shared/assistant'
import { getDefaultAppSettings, reconcileAppSettings } from '~/shared/settings'

function getCurrentAppSettings(currentSettings: AppSettings | undefined): AppSettings {
  return currentSettings ?? getDefaultAppSettings()
}

function mergeAssistantSettings(currentSettings: AppSettings | undefined, input: UpdateAssistantSettingsInput): AppSettings {
  const appSettings = getCurrentAppSettings(currentSettings)

  return reconcileAppSettings({
    ...appSettings,
    assistant: normalizeAssistantSettings(
      input.provider ?? appSettings.assistant.provider,
      input.model ?? appSettings.assistant.model,
      input.reasoning ?? appSettings.assistant.reasoning,
    ),
  })
}

export function useAssistantSettings() {
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
  const assistantMutation = useMutation({
    mutationFn: updateAssistantConnection,
  })

  const settings = computed<AssistantSettings>(() => normalizeAssistantSettings(
    appSettingsQuery.data.value?.assistant.provider,
    appSettingsQuery.data.value?.assistant.model,
    appSettingsQuery.data.value?.assistant.reasoning,
  ))

  const providerAvailability = computed<AiProviderAvailability[]>(() => (
    (providerAvailabilityQuery.data.value?.providers ?? [])
      .filter(entry => entry.provider === 'claude' || entry.provider === 'codex')
  ))

  function isProviderAvailable(provider: AssistantProvider): boolean {
    return providerAvailability.value.find(entry => entry.provider === provider)?.available ?? false
  }

  const availableModels = computed(() => getAssistantModelsForProvider(settings.value.provider))

  async function persistAssistantSettings(input: UpdateAssistantSettingsInput): Promise<void> {
    const previousSettings = getCurrentAppSettings(queryClient.getQueryData<AppSettings>(APP_SETTINGS_QUERY_KEY))
    const optimisticSettings = mergeAssistantSettings(previousSettings, input)

    queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, optimisticSettings)

    try {
      const persistedSettings = await assistantMutation.mutateAsync(input)
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, persistedSettings)
    }
    catch (error) {
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, previousSettings)
      throw error
    }
  }

  async function setProvider(provider: AssistantProvider): Promise<void> {
    if (!ASSISTANT_PROVIDERS.includes(provider)) {
      return
    }

    const nextModel = isSupportedAssistantModel(provider, settings.value.model)
      ? settings.value.model
      : getDefaultAssistantModel(provider)

    await persistAssistantSettings({ provider, model: nextModel })
  }

  async function setModel(model: string): Promise<void> {
    const nextModel = isSupportedAssistantModel(settings.value.provider, model)
      ? model
      : getDefaultAssistantModel(settings.value.provider)

    await persistAssistantSettings({ model: nextModel })
  }

  async function setReasoning(reasoning: AssistantReasoning): Promise<void> {
    await persistAssistantSettings({ reasoning })
  }

  return {
    settings,
    providers: ASSISTANT_PROVIDERS,
    providerAvailability,
    isProviderAvailable,
    isLoadingProviders: computed(() => providerAvailabilityQuery.isLoading.value),
    availableModels,
    setProvider,
    setModel,
    setReasoning,
  }
}
