import {
  getAiModelsForProvider,
  getDefaultModelForProvider,
  getProviderLabel,
  isSupportedModel,
  type AiProvider,
} from '../../shared/ai'
import { env } from '../config'

export function getConfiguredDefaultProvider(): AiProvider {
  return env.AI_DEFAULT_PROVIDER
}

export function getConfiguredDefaultModel(provider: AiProvider): string {
  const configuredModel = provider === 'openai'
    ? env.OPENAI_DEFAULT_MODEL
    : provider === 'anthropic'
      ? env.ANTHROPIC_DEFAULT_MODEL
      : env.CEREBRAS_DEFAULT_MODEL

  return isSupportedModel(provider, configuredModel)
    ? configuredModel
    : getDefaultModelForProvider(provider)
}

export function getProviderApiKey(provider: AiProvider): string {
  return provider === 'openai'
    ? env.OPENAI_API_KEY
    : provider === 'anthropic'
      ? env.ANTHROPIC_API_KEY
      : env.CEREBRAS_API_KEY
}

export function assertProviderConfigured(provider: AiProvider): void {
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

export function getAvailableModels(provider: AiProvider) {
  return getAiModelsForProvider(provider)
}
