import {
  adfToPlainText,
  plainTextToAdf,
  type JiraAdfDocument,
} from '../../shared/jiraAdf'
import type {
  AiProvider,
  GenerateAiDescriptionResponse,
} from '../../shared/ai'
import {
  assertProviderConfigured,
  assertSupportedModel,
  getProviderApiKey,
} from './catalog'
import { generateWithAnthropic } from './providers/anthropic'
import { generateWithCerebras } from './providers/cerebras'
import { generateWithOpenAi } from './providers/openai'

interface GenerateDescriptionInput {
  instruction: string
  currentDescriptionAdf: JiraAdfDocument | null
  provider: AiProvider
  model: string
}

function buildUserPrompt(input: GenerateDescriptionInput): string {
  const currentDescription = adfToPlainText(input.currentDescriptionAdf).trim()

  return [
    'Format the result for Jira',
    '',
    'Current description:',
    currentDescription || '(No current description.)',
    '',
    'Instruction:',
    input.instruction.trim(),
  ].join('\n')
}

function normalizeProviderError(error: unknown): Error {
  if (error instanceof Error && error.message.trim()) {
    return new Error(error.message.trim())
  }

  return new Error('The AI provider request failed.')
}

export async function generateTicketDescription(
  input: GenerateDescriptionInput,
): Promise<GenerateAiDescriptionResponse> {
  assertSupportedModel(input.provider, input.model)
  assertProviderConfigured(input.provider)

  const apiKey = getProviderApiKey(input.provider)
  const prompt = {
    model: input.model,
    userPrompt: buildUserPrompt(input),
  }

  let descriptionText = ''

  try {
    if (input.provider === 'openai') {
      descriptionText = await generateWithOpenAi(apiKey, prompt)
    } else if (input.provider === 'anthropic') {
      descriptionText = await generateWithAnthropic(apiKey, prompt)
    } else {
      descriptionText = await generateWithCerebras(apiKey, prompt)
    }
  } catch (error: unknown) {
    throw normalizeProviderError(error)
  }

  if (!descriptionText.trim()) {
    throw new Error('The AI provider returned an empty description.')
  }

  return {
    descriptionText,
    descriptionAdf: plainTextToAdf(descriptionText),
  }
}
