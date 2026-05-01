import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useQuery } from '@tanstack/vue-query'
import { fetchAiProviderAvailability } from '@/api/settings'
import {
  AI_MODEL_CATALOG,
  DEFAULT_AI_PROVIDER,
  getDefaultModelForProvider,
  isAiProvider,
  isSupportedModel,
  normalizeAiSettings,
  type AiProvider,
  type AiProviderAvailability,
  type AiSettings,
} from '~/shared/ai'

const AI_PROVIDER_STORAGE_KEY = 'jira2.settings.aiProvider'
const AI_MODEL_STORAGE_KEY = 'jira2.settings.aiModel'

export const AI_PROVIDER_AVAILABILITY_QUERY_KEY: readonly ['ai-provider-availability'] = ['ai-provider-availability']

const FALLBACK_PROVIDER_AVAILABILITY: AiProviderAvailability[] = [
  {
    provider: DEFAULT_AI_PROVIDER,
    available: true,
    detail: 'Cerebras can be selected after saving a local API key.',
  },
]

function readProvider(value: string): AiProvider {
  return isAiProvider(value) ? value : DEFAULT_AI_PROVIDER
}

function readModel(value: string): string {
  return value.trim()
}

function getAvailableProviders(providerAvailability: readonly AiProviderAvailability[]): AiProvider[] {
  return providerAvailability
    .filter((entry) => entry.available)
    .map((entry) => entry.provider)
}

function getPreferredFallbackProvider(availableProviders: readonly AiProvider[]): AiProvider {
  return availableProviders.includes(DEFAULT_AI_PROVIDER)
    ? DEFAULT_AI_PROVIDER
    : availableProviders[0] ?? DEFAULT_AI_PROVIDER
}

export function useAiSettings() {
  const providerAvailabilityQuery = useQuery({
    queryKey: AI_PROVIDER_AVAILABILITY_QUERY_KEY,
    queryFn: fetchAiProviderAvailability,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const providerStorage = useLocalStorage<AiProvider>(
    AI_PROVIDER_STORAGE_KEY,
    DEFAULT_AI_PROVIDER,
    {
      serializer: {
        read: readProvider,
        write: (value: AiProvider) => value,
      },
    },
  )

  const modelStorage = useLocalStorage<string>(
    AI_MODEL_STORAGE_KEY,
    getDefaultModelForProvider(DEFAULT_AI_PROVIDER),
    {
      serializer: {
        read: readModel,
        write: (value: string) => value,
      },
    },
  )

  const providerAvailability = computed<AiProviderAvailability[]>(() => (
    providerAvailabilityQuery.data.value?.providers ?? FALLBACK_PROVIDER_AVAILABILITY
  ))
  const providers = computed<AiProvider[]>(() => getAvailableProviders(providerAvailability.value))
  const fallbackProvider = computed<AiProvider>(() => getPreferredFallbackProvider(providers.value))
  const settings = computed<AiSettings>(() => normalizeAiSettings(
    providerStorage.value,
    modelStorage.value,
    fallbackProvider.value,
    providers.value,
  ))
  const availableModels = computed(() => AI_MODEL_CATALOG[settings.value.provider])

  function setProvider(provider: AiProvider): void {
    if (!providers.value.includes(provider)) {
      providerStorage.value = fallbackProvider.value
      modelStorage.value = getDefaultModelForProvider(fallbackProvider.value)
      return
    }

    providerStorage.value = provider

    if (!isSupportedModel(provider, modelStorage.value)) {
      modelStorage.value = getDefaultModelForProvider(provider)
    }
  }

  function setModel(model: string): void {
    if (!isSupportedModel(settings.value.provider, model)) {
      modelStorage.value = getDefaultModelForProvider(settings.value.provider)
      return
    }

    modelStorage.value = model
  }

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
