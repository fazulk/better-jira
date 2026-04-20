import OpenAI from 'openai'

export interface ProviderPrompt {
  model: string
  userPrompt: string
}

export async function generateWithOpenAi(apiKey: string, prompt: ProviderPrompt): Promise<string> {
  const client = new OpenAI({ apiKey })
  const response = await client.responses.create({
    model: prompt.model,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt.userPrompt,
          },
        ],
      },
    ],
  })

  return response.output_text.trim()
}
