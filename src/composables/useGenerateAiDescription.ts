import { useMutation } from '@tanstack/vue-query'
import { generateAiDescription } from '@/api/jira'
import type {
  GenerateAiDescriptionRequest,
  GenerateAiDescriptionResponse,
} from '~/shared/ai'

interface MutationInput {
  key: string
  input: GenerateAiDescriptionRequest
}

export function useGenerateAiDescription() {
  return useMutation<GenerateAiDescriptionResponse, Error, MutationInput>({
    mutationFn: ({ key, input }) => generateAiDescription(key, input),
  })
}
