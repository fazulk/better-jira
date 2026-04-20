import Anthropic from '@anthropic-ai/sdk'
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages'
import type { ProviderPrompt } from './openai'

function isTextBlock(block: Anthropic.Messages.ContentBlock): block is TextBlock {
  return block.type === 'text'
}

export async function generateWithAnthropic(apiKey: string, prompt: ProviderPrompt): Promise<string> {
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: prompt.model,
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: prompt.userPrompt,
      },
    ],
  })

  return response.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('\n')
    .trim()
}
