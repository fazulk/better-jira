import type { JiraAdfDocument } from './jiraAdf'

export type AiProvider = 'openai' | 'anthropic' | 'cerebras'
export const AI_PROVIDERS: AiProvider[] = ['cerebras']

export interface AiModelOption {
  id: string
  label: string
  provider: AiProvider
}

export interface AiSettings {
  provider: AiProvider
  model: string
}

export interface GenerateAiDescriptionRequest {
  instruction: string
  currentDescriptionAdf: JiraAdfDocument | null
  provider: AiProvider
  model: string
}

export interface GenerateAiDescriptionResponse {
  descriptionText: string
  descriptionAdf: JiraAdfDocument | null
}

export const DEFAULT_AI_PROVIDER: AiProvider = 'cerebras'

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest'
export const DEFAULT_CEREBRAS_MODEL = 'llama3.1-8b'

export const AI_MODEL_CATALOG: Record<AiProvider, AiModelOption[]> = {
  openai: [],
  anthropic: [],
  cerebras: [
    { id: 'llama3.1-8b', label: 'Llama 3.1 8B', provider: 'cerebras' },
  ],
}

export function isAiProvider(value: unknown): value is AiProvider {
  return value === 'openai' || value === 'anthropic' || value === 'cerebras'
}

export function getProviderLabel(provider: AiProvider): string {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'anthropic') return 'Anthropic'
  return 'Cerebras'
}

export function getDefaultModelForProvider(provider: AiProvider): string {
  if (provider === 'openai') return DEFAULT_OPENAI_MODEL
  if (provider === 'anthropic') return DEFAULT_ANTHROPIC_MODEL
  return DEFAULT_CEREBRAS_MODEL
}

export function getAiModelsForProvider(provider: AiProvider): AiModelOption[] {
  return AI_MODEL_CATALOG[provider]
}

export function isSupportedModel(provider: AiProvider, model: string): boolean {
  return getAiModelsForProvider(provider).some((option) => option.id === model)
}

export function normalizeAiSettings(
  provider: unknown,
  model: unknown,
  fallbackProvider: AiProvider = DEFAULT_AI_PROVIDER,
): AiSettings {
  const normalizedProvider = isAiProvider(provider) ? provider : fallbackProvider
  const normalizedModel = typeof model === 'string' && isSupportedModel(normalizedProvider, model)
    ? model
    : getDefaultModelForProvider(normalizedProvider)

  return {
    provider: normalizedProvider,
    model: normalizedModel,
  }
}
