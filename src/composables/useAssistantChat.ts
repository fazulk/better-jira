import type { Ref } from 'vue'
import type { AssistantChatMessage } from '~/shared/assistant'
import { computed, ref } from 'vue'
import { streamAssistantChat } from '@/api/assistant'
import { useAssistantSettings } from '@/composables/useAssistantSettings'

export interface AssistantTranscriptMessage extends AssistantChatMessage {
  id: number
  /** True while this assistant message is still being streamed. */
  pending?: boolean
}

interface UseAssistantChatOptions {
  ticketKey: Ref<string | null | undefined>
  ticketSummary: Ref<string | null | undefined>
  /** Called after a response is fully and successfully received (not on stop/error). */
  onComplete?: () => void
}

export function useAssistantChat(options: UseAssistantChatOptions) {
  const { settings } = useAssistantSettings()

  const messages = ref<AssistantTranscriptMessage[]>([])
  const isStreaming = ref(false)
  const statusText = ref('')
  const errorText = ref('')
  let nextId = 0
  let abortController: AbortController | null = null

  const canSend = computed(() => !isStreaming.value)

  function reset(): void {
    abortController?.abort()
    abortController = null
    messages.value = []
    isStreaming.value = false
    statusText.value = ''
    errorText.value = ''
  }

  function stop(): void {
    abortController?.abort()
    abortController = null
    isStreaming.value = false
    statusText.value = ''
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'assistant') {
      last.pending = false
      if (!last.content.trim()) {
        last.content = '_Stopped._'
      }
    }
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || isStreaming.value) {
      return
    }

    errorText.value = ''
    statusText.value = ''

    messages.value.push({ id: nextId++, role: 'user', content: trimmed })
    const assistantMessage: AssistantTranscriptMessage = { id: nextId++, role: 'assistant', content: '', pending: true }
    messages.value.push(assistantMessage)

    const requestMessages: AssistantChatMessage[] = messages.value
      .filter(message => !(message.role === 'assistant' && message.pending))
      .map(message => ({ role: message.role, content: message.content }))

    isStreaming.value = true
    abortController = new AbortController()
    let succeeded = false

    try {
      await streamAssistantChat(
        {
          provider: settings.value.provider,
          model: settings.value.model,
          reasoning: settings.value.reasoning,
          ticketKey: options.ticketKey.value ?? undefined,
          ticketSummary: options.ticketSummary.value ?? undefined,
          messages: requestMessages,
        },
        (chunk) => {
          if (chunk.type === 'delta') {
            assistantMessage.content += chunk.text
            statusText.value = ''
          }
          else if (chunk.type === 'status') {
            statusText.value = chunk.text
          }
          else if (chunk.type === 'error') {
            errorText.value = chunk.message
          }
        },
        abortController.signal,
      )
      succeeded = true
    }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        errorText.value = error instanceof Error ? error.message : 'The assistant request failed.'
      }
    }
    finally {
      assistantMessage.pending = false
      if (errorText.value && !assistantMessage.content.trim()) {
        // Drop the empty assistant bubble so only the error banner shows.
        messages.value = messages.value.filter(message => message.id !== assistantMessage.id)
      }
      isStreaming.value = false
      statusText.value = ''
      abortController = null
      if (succeeded && !errorText.value) {
        options.onComplete?.()
      }
    }
  }

  return {
    messages,
    isStreaming,
    statusText,
    errorText,
    canSend,
    send,
    stop,
    reset,
  }
}
