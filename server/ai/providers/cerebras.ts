import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ProviderPrompt } from './openai'

const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1'

export async function generateWithCerebras(apiKey: string, prompt: ProviderPrompt): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: CEREBRAS_BASE_URL,
  })

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: prompt.userPrompt,
    },
  ]

  const response = await client.chat.completions.create({
    model: prompt.model,
    messages,
  })

  return response.choices
    .map((choice) => choice.message.content ?? '')
    .join('\n')
    .trim()
}
