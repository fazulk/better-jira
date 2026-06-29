import type { AiModelOption } from './ai'
import {
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_CODEX_MODEL,
  getAiModelsForProvider,
} from './ai'

/** Providers that back the "Ask" chat assistant. These are local CLIs we proxy to. */
export type AssistantProvider = 'claude' | 'codex'
export const ASSISTANT_PROVIDERS: AssistantProvider[] = ['claude', 'codex']

export type AssistantReasoning = 'low' | 'medium' | 'high'
export const ASSISTANT_REASONING_LEVELS: AssistantReasoning[] = ['low', 'medium', 'high']

export interface AssistantSettings {
  provider: AssistantProvider
  model: string
  reasoning: AssistantReasoning
}

export const DEFAULT_ASSISTANT_PROVIDER: AssistantProvider = 'claude'
export const DEFAULT_ASSISTANT_REASONING: AssistantReasoning = 'medium'

export interface AssistantChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantChatRequest {
  provider: AssistantProvider
  model: string
  reasoning: AssistantReasoning
  /** Key of the ticket the user is currently viewing, used as context. */
  ticketKey?: string
  /** Summary of the current ticket, passed so the assistant has immediate context. */
  ticketSummary?: string
  messages: AssistantChatMessage[]
}

/**
 * Server-sent stream chunks for an assistant chat turn.
 * - `delta`: incremental assistant answer text to append.
 * - `status`: transient activity (e.g. a tool/command the agent ran).
 * - `done`: the turn finished successfully.
 * - `error`: the turn failed; `message` explains why.
 */
export type AssistantStreamChunk
  = | { type: 'delta', text: string }
    | { type: 'status', text: string }
    | { type: 'done' }
    | { type: 'error', message: string }

export function isAssistantProvider(value: unknown): value is AssistantProvider {
  return value === 'claude' || value === 'codex'
}

export function isAssistantReasoning(value: unknown): value is AssistantReasoning {
  return value === 'low' || value === 'medium' || value === 'high'
}

export function getAssistantProviderLabel(provider: AssistantProvider): string {
  return provider === 'codex' ? 'Codex' : 'Claude'
}

/** Label shown on the trigger button, e.g. "Ask Claude" / "Ask Codex". */
export function getAssistantActionLabel(provider: AssistantProvider): string {
  return `Ask ${getAssistantProviderLabel(provider)}`
}

export function getAssistantModelsForProvider(provider: AssistantProvider): AiModelOption[] {
  return getAiModelsForProvider(provider)
}

export function getDefaultAssistantModel(provider: AssistantProvider): string {
  return provider === 'codex' ? DEFAULT_CODEX_MODEL : DEFAULT_CLAUDE_MODEL
}

export function isSupportedAssistantModel(provider: AssistantProvider, model: string): boolean {
  return getAssistantModelsForProvider(provider).some(option => option.id === model)
}

export function getAssistantReasoningLabel(reasoning: AssistantReasoning): string {
  if (reasoning === 'low')
    return 'Low'
  if (reasoning === 'high')
    return 'High'
  return 'Medium'
}

export function normalizeAssistantSettings(
  provider: unknown,
  model: unknown,
  reasoning: unknown,
): AssistantSettings {
  const normalizedProvider = isAssistantProvider(provider) ? provider : DEFAULT_ASSISTANT_PROVIDER
  const normalizedModel = typeof model === 'string' && isSupportedAssistantModel(normalizedProvider, model)
    ? model
    : getDefaultAssistantModel(normalizedProvider)
  const normalizedReasoning = isAssistantReasoning(reasoning) ? reasoning : DEFAULT_ASSISTANT_REASONING

  return {
    provider: normalizedProvider,
    model: normalizedModel,
    reasoning: normalizedReasoning,
  }
}

export function getDefaultAssistantSettings(): AssistantSettings {
  return {
    provider: DEFAULT_ASSISTANT_PROVIDER,
    model: getDefaultAssistantModel(DEFAULT_ASSISTANT_PROVIDER),
    reasoning: DEFAULT_ASSISTANT_REASONING,
  }
}

function normalizeChatMessages(value: unknown): AssistantChatMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  const messages: AssistantChatMessage[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }
    const record: Record<string, unknown> = entry
    const role = record.role === 'assistant' ? 'assistant' : 'user'
    const content = typeof record.content === 'string' ? record.content : ''
    if (content.trim().length > 0) {
      messages.push({ role, content })
    }
  }
  return messages
}

/** Validates a raw request body into a chat request, or returns null when unusable. */
export function normalizeAssistantChatRequest(value: unknown): AssistantChatRequest | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const record: Record<string, unknown> = value
  const settings = normalizeAssistantSettings(record.provider, record.model, record.reasoning)
  const messages = normalizeChatMessages(record.messages)
  const lastMessage = messages[messages.length - 1]

  if (!lastMessage || lastMessage.role !== 'user') {
    return null
  }

  return {
    provider: settings.provider,
    model: settings.model,
    reasoning: settings.reasoning,
    ticketKey: typeof record.ticketKey === 'string' && record.ticketKey.trim() ? record.ticketKey.trim() : undefined,
    ticketSummary: typeof record.ticketSummary === 'string' && record.ticketSummary.trim() ? record.ticketSummary.trim() : undefined,
    messages,
  }
}
