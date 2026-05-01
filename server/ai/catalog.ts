import {
  AI_PROVIDERS,
  getAiModelsForProvider,
  getDefaultModelForProvider,
  getProviderLabel,
  isSupportedModel,
  type AiProvider,
  type AiProviderAvailability,
} from '../../shared/ai'
import { env } from '../config'
import { assertLocalAiProviderConfigured, getLocalAiProviderAvailability } from './localProviders'

export function getConfiguredDefaultProvider(): AiProvider {
  return env.AI_DEFAULT_PROVIDER
}

export function getConfiguredDefaultModel(provider: AiProvider): string {
  const configuredModel = provider === 'openai'
    ? env.OPENAI_DEFAULT_MODEL
    : provider === 'anthropic'
      ? env.ANTHROPIC_DEFAULT_MODEL
      : provider === 'cerebras'
        ? env.CEREBRAS_DEFAULT_MODEL
        : getDefaultModelForProvider(provider)

  return isSupportedModel(provider, configuredModel)
    ? configuredModel
    : getDefaultModelForProvider(provider)
}

export function getProviderApiKey(provider: AiProvider): string {
  if (provider === 'openai') {
    return env.OPENAI_API_KEY
  }

  if (provider === 'anthropic') {
    return env.ANTHROPIC_API_KEY
  }

  if (provider === 'cerebras') {
    return env.CEREBRAS_API_KEY
  }

  return ''
}

export function assertProviderConfigured(provider: AiProvider): void {
  if (provider === 'codex' || provider === 'claude') {
    assertLocalAiProviderConfigured(provider)
    return
  }

  if (getProviderApiKey(provider)) {
    return
  }

  if (provider === 'cerebras') {
    throw new Error('Cerebras is selected but no local Cerebras API key is configured.')
  }

  const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
  throw new Error(`${getProviderLabel(provider)} is selected but ${envKey} is missing in the server environment.`)
}

export function assertSupportedModel(provider: AiProvider, model: string): void {
  if (isSupportedModel(provider, model)) {
    return
  }

  throw new Error(`Model ${model} is not supported for provider ${provider}.`)
}

function getCloudProviderAvailability(provider: AiProvider): AiProviderAvailability {
  if (provider === 'cerebras') {
    return {
      provider,
      available: true,
      detail: env.CEREBRAS_API_KEY
        ? 'Cerebras API key is configured.'
        : 'Cerebras can be selected after saving a local API key.',
    }
  }

  const apiKey = getProviderApiKey(provider)
  const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'

  return {
    provider,
    available: apiKey.length > 0,
    detail: apiKey.length > 0
      ? `${getProviderLabel(provider)} API key is configured.`
      : `${getProviderLabel(provider)} requires ${envKey} in the server environment.`,
  }
}

export function getAiProviderAvailability(): AiProviderAvailability[] {
  const localAvailabilityEntries = getLocalAiProviderAvailability()
    .map((entry): [AiProvider, AiProviderAvailability] => [entry.provider, entry])
  const localAvailability = new Map<AiProvider, AiProviderAvailability>(localAvailabilityEntries)

  return AI_PROVIDERS.map((provider) => {
    const localProvider = localAvailability.get(provider)
    return localProvider ?? getCloudProviderAvailability(provider)
  })
}

export function getAvailableModels(provider: AiProvider) {
  return getAiModelsForProvider(provider)
}
