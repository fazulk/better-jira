<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import JiraDescriptionEditor from '@/components/JiraDescriptionEditor.vue'
import { useAiInstructionPresets } from '@/composables/useAiInstructionPresets'
import { useAiSettings } from '@/composables/useAiSettings'
import { useGenerateAiDescription } from '@/composables/useGenerateAiDescription'
import type { JiraAdfDocument } from '@/types/jira'
import { getProviderLabel } from '~/shared/ai'
import { coerceDescriptionToAdf } from '~/shared/jiraAdf'

const props = defineProps<{
  open: boolean
  currentDescription: string
  currentDescriptionAdf?: JiraAdfDocument | null
  ticketKey: string
  ticketTitle: string
  isSaving: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [descriptionAdf: JiraAdfDocument | null]
}>()

const proposedDescription = ref<JiraAdfDocument | null>(null)
const proposedDescriptionEditorRef = ref<{ focusEditor: () => void } | null>(null)
const promptText = ref('')
const generationError = ref<string | null>(null)
const { visibleInstructionPresets } = useAiInstructionPresets()
const { settings: aiSettings } = useAiSettings()
const generateMutation = useGenerateAiDescription()

const isProcessing = computed(() => generateMutation.isPending.value)
const canGenerate = computed(() => promptText.value.trim().length > 0 && !isProcessing.value)

watch(() => props.open, (isOpen: boolean) => {
  if (isOpen) {
    proposedDescription.value = coerceDescriptionToAdf(props.currentDescription, props.currentDescriptionAdf ?? undefined)
    promptText.value = ''
    generationError.value = null
    nextTick(() => {
      proposedDescriptionEditorRef.value?.focusEditor()
    })
  }
})

function closeModal() {
  if (props.isSaving) return
  emit('close')
}

function confirmChanges() {
  emit('confirm', proposedDescription.value)
}

function selectPrompt(text: string) {
  promptText.value = text
}

async function generateDescription(): Promise<void> {
  if (!canGenerate.value) {
    return
  }

  generationError.value = null

  try {
    const response = await generateMutation.mutateAsync({
      key: props.ticketKey,
      input: {
        instruction: promptText.value.trim(),
        currentDescriptionAdf: proposedDescription.value,
        provider: aiSettings.value.provider,
        model: aiSettings.value.model,
      },
    })

    proposedDescription.value = response.descriptionAdf
  } catch (error: unknown) {
    generationError.value = error instanceof Error ? error.message : 'Failed to generate description.'
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm"
        @click.self="closeModal"
      >
        <div class="flex max-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-surface-1 shadow-2xl shadow-black/50">

          <!-- Header -->
          <div class="flex items-start justify-between border-b border-white/[0.06] px-6 py-5">
            <div>
              <p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">AI Assistant</p>
              <h2 class="mt-1 text-lg font-semibold text-white">{{ ticketTitle || ticketKey }}
                <span class="ml-2 text-sm font-normal text-slate-500">{{ ticketKey }}</span>
              </h2>
            </div>
            <button
              type="button"
              class="rounded-xl border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
              :disabled="isSaving"
              @click="closeModal"
            >
              Close
            </button>
          </div>

          <!-- Body: Two columns -->
          <div class="flex min-h-[460px] min-w-0 flex-1 divide-x divide-white/[0.06] overflow-hidden">

            <!-- Left Column: Proposed Description -->
            <div class="flex min-w-0 flex-1 flex-col overflow-hidden p-6">
              <h3 class="mb-3 text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium">Proposed Description</h3>
              <div class="min-h-0 flex-1 overflow-hidden">
                <JiraDescriptionEditor
                  ref="proposedDescriptionEditorRef"
                  v-model="proposedDescription"
                  placeholder="The proposed description will appear here..."
                />
              </div>
            </div>

            <!-- Right Column: AI Instructions -->
            <div class="flex w-[380px] shrink-0 flex-col overflow-y-auto p-6">
              <h3 class="mb-3 text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium">AI Instructions</h3>
              <p class="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-slate-400">
                Using {{ getProviderLabel(aiSettings.provider) }} / {{ aiSettings.model }}
              </p>

              <!-- Pre-formatted prompt chips -->
              <div class="mb-4 flex flex-wrap gap-2">
                <button
                  v-for="prompt in visibleInstructionPresets"
                  :key="prompt.id"
                  type="button"
                  class="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/20 hover:text-emerald-200"
                  @click="selectPrompt(prompt.text)"
                >
                  {{ prompt.label }}
                </button>
              </div>

              <!-- Instruction textarea -->
              <textarea
                v-model="promptText"
                class="mb-4 w-full flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-300 outline-none transition focus:border-violet-500/40 focus:bg-white/[0.06] leading-relaxed font-body resize-y min-h-[120px]"
                placeholder="Describe how you want to enhance the description..."
              />

              <p v-if="generationError" class="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-200">
                {{ generationError }}
              </p>

              <button
                type="button"
                class="w-full rounded-xl border border-violet-500/30 bg-violet-500/20 px-4 py-2.5 text-xs font-medium text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!canGenerate"
                @click="generateDescription"
              >
                <span class="flex items-center justify-center gap-2">
                  <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z"/>
                  </svg>
                  {{ isProcessing ? 'Generating...' : 'Generate with AI' }}
                </span>
              </button>
            </div>

          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-4">
            <button
              type="button"
              class="rounded-2xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
              :disabled="isSaving"
              @click="closeModal"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-2xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isSaving"
              @click="confirmChanges"
            >
              {{ isSaving ? 'Saving...' : 'Confirm Changes' }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>
