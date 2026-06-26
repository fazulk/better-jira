import type {
  GenerateAiDescriptionRequest,
  GenerateAiDescriptionResponse,
} from '~/shared/ai'
import { useMutation } from '@tanstack/vue-query'
import { generateAiDescription } from '@/api/jira'

interface MutationInput {
  key: string
  input: GenerateAiDescriptionRequest
}

export function useGenerateAiDescription() {
  return useMutation<GenerateAiDescriptionResponse, Error, MutationInput>({
    mutationFn: ({ key, input }) => generateAiDescription(key, input),
  })
}
