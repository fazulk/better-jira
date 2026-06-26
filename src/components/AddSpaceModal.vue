<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAvailableSpaces } from '@/composables/useAvailableSpaces'
import { useSpaceSettings } from '@/composables/useSpaceSettings'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  enabledSpaces,
  hasJiraCredentialsConfigured,
  isSaving,
  addOrEnableSpace,
} = useSpaceSettings()
const {
  availableSpaces,
  errorMessage,
  isLoading,
  ensureAvailableSpacesLoaded,
} = useAvailableSpaces(hasJiraCredentialsConfigured)

const searchQuery = ref('')
const feedback = ref<{ kind: 'success' | 'error', message: string } | null>(null)
const addingSpaceKey = ref<string | null>(null)

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())
const enabledSpaceKeys = computed(() => new Set(enabledSpaces.value.map(space => space.key)))
const visibleSpaces = computed(() => availableSpaces.value
  .filter(space => !enabledSpaceKeys.value.has(space.key))
  .filter((space) => {
    const query = normalizedSearchQuery.value
    if (!query) {
      return true
    }

    return space.name.toLowerCase().includes(query) || space.key.toLowerCase().includes(query)
  })
  .slice(0, 40))

watch(() => props.open, (open) => {
  if (!open) {
    searchQuery.value = ''
    feedback.value = null
    addingSpaceKey.value = null
    return
  }

  void ensureAvailableSpacesLoaded()
})

function closeModal(): void {
  emit('close')
}

async function addSpace(space: { key: string, name: string }): Promise<void> {
  addingSpaceKey.value = space.key
  feedback.value = null

  try {
    await addOrEnableSpace(space)
    feedback.value = {
      kind: 'success',
      message: `Added ${space.name}.`,
    }
  }
  catch (error) {
    feedback.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Failed to add space.',
    }
  }
  finally {
    addingSpaceKey.value = null
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeModal()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-3 py-[12vh] backdrop-blur-sm"
        @click.self="closeModal"
      >
        <div
          class="w-full max-w-[34rem] overflow-hidden rounded-lg border border-white/[0.08] bg-surface-1 shadow-xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Add space"
          @keydown="handleKeydown"
        >
          <div class="flex items-start justify-between gap-4 border-b border-white/[0.06] px-4 py-3">
            <div>
              <p class="text-sm font-medium text-slate-100">
                Add space
              </p>
              <p class="mt-0.5 text-xs text-slate-500">
                Search Jira spaces and add them to your sidebar.
              </p>
            </div>
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-sm text-slate-500 transition hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-slate-200"
              aria-label="Close"
              @click="closeModal"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                <path stroke-linecap="round" d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />
              </svg>
            </button>
          </div>

          <div class="space-y-3 px-4 py-4">
            <label class="block">
              <span class="mb-2 block text-xs font-medium text-slate-500">Search Jira spaces</span>
              <input
                v-model="searchQuery"
                type="text"
                name="sidebar-space-search"
                placeholder="Search by space name or key"
                class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-white/[0.16] focus:bg-white/[0.06]"
                autofocus
              >
            </label>

            <p v-if="!hasJiraCredentialsConfigured" class="rounded-md border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-200">
              Complete Jira setup before browsing remote spaces.
            </p>

            <p v-else-if="isLoading" class="rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-xs text-slate-500">
              Loading Jira spaces...
            </p>

            <p v-else-if="errorMessage" class="rounded-md border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2 text-xs text-rose-300">
              {{ errorMessage }}
            </p>

            <div v-else class="max-h-[22rem] overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.015]">
              <button
                v-for="space in visibleSpaces"
                :key="space.key"
                type="button"
                class="flex w-full items-center justify-between gap-3 border-b border-white/[0.05] px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.04]"
                :disabled="isSaving || addingSpaceKey !== null"
                @click="addSpace(space)"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium text-slate-200">{{ space.name }}</span>
                  <span class="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-slate-500">{{ space.key }}</span>
                </span>
                <span class="shrink-0 text-xs text-slate-500">
                  {{ addingSpaceKey === space.key ? 'Adding...' : 'Add' }}
                </span>
              </button>

              <p v-if="!visibleSpaces.length" class="px-3 py-6 text-center text-xs text-slate-500">
                No available Jira spaces matched your search.
              </p>
            </div>

            <p
              v-if="feedback"
              class="text-xs"
              :class="feedback.kind === 'success' ? 'text-slate-400' : 'text-rose-300'"
            >
              {{ feedback.message }}
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
