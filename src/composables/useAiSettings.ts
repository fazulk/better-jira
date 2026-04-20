import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import {
  AI_PROVIDERS,
  AI_MODEL_CATALOG,
  DEFAULT_AI_PROVIDER,
  getDefaultModelForProvider,
  isAiProvider,
  isSupportedModel,
  normalizeAiSettings,
  type AiProvider,
} from '~/shared/ai'

const AI_PROVIDER_STORAGE_KEY = 'jira2.settings.aiProvider'
const AI_MODEL_STORAGE_KEY = 'jira2.settings.aiModel'

function readProvider(value: string): AiProvider {
  return isAiProvider(value) ? value : DEFAULT_AI_PROVIDER
}

function readModel(value: string): string {
  return value.trim()
}

export function useAiSettings() {
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

  const settings = computed<AiSettings>(() => normalizeAiSettings(providerStorage.value, modelStorage.value))
  const availableModels = computed(() => AI_MODEL_CATALOG[settings.value.provider])

  function setProvider(provider: AiProvider): void {
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
    providers: AI_PROVIDERS,
    settings,
    availableModels,
    setProvider,
    setModel,
  }
}
