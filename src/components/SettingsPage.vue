<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { AiInstructionPresetDraft } from '@/composables/useAiInstructionPresets'
import { useAvailableSpaces } from '@/composables/useAvailableSpaces'
import { useAiInstructionPresets } from '@/composables/useAiInstructionPresets'
import { useAiSettings } from '@/composables/useAiSettings'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { getProviderLabel, isAiProvider, type AiProviderAvailability } from '~/shared/ai'
import type { AppSpaceSetting, JiraSpaceDirectoryEntry } from '~/shared/settings'

const emit = defineEmits<{
  close: []
}>()

const {
  allInstructionPresets,
  addLocalPreset,
  removeLocalPreset,
  togglePresetEnabled,
  updateLocalPreset,
} = useAiInstructionPresets()
const {
  providers,
  providerAvailability,
  isLoadingProviders,
  providerAvailabilityError,
  settings: aiSettings,
  availableModels,
  setProvider,
  setModel,
} = useAiSettings()
const {
  aiConnection,
  spaces,
  jiraConnection,
  hasJiraCredentialsConfigured,
  isSaving: isSavingSpaceSettings,
  addOrEnableSpace,
  disableSpace,
  updateJiraCredentials,
  updateAiCredentials,
} = useSpaceSettings()
const {
  availableSpaces,
  errorMessage: availableSpacesErrorMessage,
  isLoading: isLoadingAvailableSpaces,
} = useAvailableSpaces(hasJiraCredentialsConfigured)

const newPreset = ref<AiInstructionPresetDraft>({
  label: '',
  text: '',
})
const newSpaceKey = ref('')
const cerebrasApiKey = ref('')
const jiraApiToken = ref('')
const spaceSearchQuery = ref('')
const spaceFeedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)
const aiFeedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)
const jiraFeedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)
let spaceFeedbackTimeout: ReturnType<typeof setTimeout> | null = null
let aiFeedbackTimeout: ReturnType<typeof setTimeout> | null = null
let jiraFeedbackTimeout: ReturnType<typeof setTimeout> | null = null

const editingPresetId = ref<string | null>(null)
const editingPreset = ref<AiInstructionPresetDraft>({
  label: '',
  text: '',
})

const canAddPreset = computed<boolean>(() =>
  newPreset.value.label.trim().length > 0 && newPreset.value.text.trim().length > 0,
)

const canSaveEditedPreset = computed<boolean>(() =>
  editingPreset.value.label.trim().length > 0 && editingPreset.value.text.trim().length > 0,
)

function normalizeSpaceKey(value: string): string {
  return value.trim().toUpperCase()
}

interface ResolvedSpaceItem {
  key: string
  name: string
  enabled: boolean
  availableInDirectory: boolean
}

function startEditing(presetId: string): void {
  const preset = allInstructionPresets.value.find((item) => item.id === presetId)
  if (!preset) return

  editingPresetId.value = preset.id
  editingPreset.value = {
    label: preset.label,
    text: preset.text,
  }
}

function cancelEditing(): void {
  editingPresetId.value = null
  editingPreset.value = {
    label: '',
    text: '',
  }
}

function saveEditedPreset(): void {
  if (!editingPresetId.value || !canSaveEditedPreset.value) return

  updateLocalPreset(editingPresetId.value, editingPreset.value)
  cancelEditing()
}

function saveNewPreset(): void {
  if (!canAddPreset.value) return

  addLocalPreset(newPreset.value)
  newPreset.value = {
    label: '',
    text: '',
  }
}

function isHtmlSelectElement(target: EventTarget | null): target is HTMLSelectElement {
  return target instanceof HTMLSelectElement
}

async function handleProviderChange(event: Event): Promise<void> {
  if (!isHtmlSelectElement(event.target)) {
    return
  }

  const provider = event.target.value
  if (isAiProvider(provider) && providers.value.includes(provider)) {
    try {
      await setProvider(provider)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save AI provider.'
      setAiFeedback('error', message)
    }
  }
}

function getProviderStatusClass(status: AiProviderAvailability): string {
  return status.available
    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
    : 'border-white/[0.06] bg-white/[0.02] text-slate-500'
}

async function handleModelChange(event: Event): Promise<void> {
  if (!isHtmlSelectElement(event.target)) {
    return
  }

  try {
    await setModel(event.target.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save AI model.'
    setAiFeedback('error', message)
  }
}

function clearSpaceFeedbackTimeout(): void {
  if (spaceFeedbackTimeout) {
    clearTimeout(spaceFeedbackTimeout)
    spaceFeedbackTimeout = null
  }
}

function clearAiFeedbackTimeout(): void {
  if (aiFeedbackTimeout) {
    clearTimeout(aiFeedbackTimeout)
    aiFeedbackTimeout = null
  }
}

function clearJiraFeedbackTimeout(): void {
  if (jiraFeedbackTimeout) {
    clearTimeout(jiraFeedbackTimeout)
    jiraFeedbackTimeout = null
  }
}

function setSpaceFeedback(kind: 'success' | 'error', message: string): void {
  clearSpaceFeedbackTimeout()
  spaceFeedback.value = { kind, message }
  spaceFeedbackTimeout = setTimeout(() => {
    spaceFeedback.value = null
    spaceFeedbackTimeout = null
  }, 3000)
}

function setAiFeedback(kind: 'success' | 'error', message: string): void {
  clearAiFeedbackTimeout()
  aiFeedback.value = { kind, message }
  aiFeedbackTimeout = setTimeout(() => {
    aiFeedback.value = null
    aiFeedbackTimeout = null
  }, 3000)
}

function setJiraFeedback(kind: 'success' | 'error', message: string): void {
  clearJiraFeedbackTimeout()
  jiraFeedback.value = { kind, message }
  jiraFeedbackTimeout = setTimeout(() => {
    jiraFeedback.value = null
    jiraFeedbackTimeout = null
  }, 3000)
}

const jiraConnectionSummary = computed(() => {
  if (!hasJiraCredentialsConfigured.value) {
    return 'Jira setup is incomplete. The startup modal will ask for the missing values.'
  }

  return `${jiraConnection.value.baseUrl || 'Jira URL missing'} · ${jiraConnection.value.email || 'Email missing'}`
})
const directorySpaceByKey = computed(() => new Map<string, JiraSpaceDirectoryEntry>(
  availableSpaces.value.map<[string, JiraSpaceDirectoryEntry]>((space) => [space.key, space]),
))
const configuredSpaceByKey = computed(() => new Map<string, AppSpaceSetting>(
  spaces.value.map<[string, AppSpaceSetting]>((space) => [space.key, space]),
))
const normalizedNewSpaceKey = computed(() => normalizeSpaceKey(newSpaceKey.value))
const existingManualSpace = computed(() => configuredSpaceByKey.value.get(normalizedNewSpaceKey.value) ?? null)
const canAddManualSpace = computed(() => (
  normalizedNewSpaceKey.value.length > 0
  && (!existingManualSpace.value || !existingManualSpace.value.enabled)
))
const manualAddButtonLabel = computed(() => (
  existingManualSpace.value?.enabled === false ? 'Enable space' : 'Add space'
))
const spaceSearchQueryNormalized = computed(() => spaceSearchQuery.value.trim().toLowerCase())

function matchesSpaceQuery(space: Pick<ResolvedSpaceItem, 'key' | 'name'>): boolean {
  const query = spaceSearchQueryNormalized.value
  if (!query) {
    return true
  }

  return space.name.toLowerCase().includes(query) || space.key.toLowerCase().includes(query)
}

function getResolvedSpaceName(space: Pick<AppSpaceSetting, 'key' | 'name'>): string {
  const liveDirectoryName = directorySpaceByKey.value.get(space.key)?.name
  if (liveDirectoryName) {
    return liveDirectoryName
  }

  const persistedName = space.name.trim()
  return persistedName || space.key
}

const configuredSpaceItems = computed<ResolvedSpaceItem[]>(() => spaces.value
  .map(space => ({
    key: space.key,
    name: getResolvedSpaceName(space),
    enabled: space.enabled,
    availableInDirectory: directorySpaceByKey.value.has(space.key),
  }))
  .filter(matchesSpaceQuery))
const filteredDirectorySpaces = computed<ResolvedSpaceItem[]>(() => availableSpaces.value
  .filter(space => !configuredSpaceByKey.value.has(space.key))
  .map(space => ({
    key: space.key,
    name: space.name,
    enabled: false,
    availableInDirectory: true,
  }))
  .filter(matchesSpaceQuery))
const visibleDirectorySpaces = computed(() => filteredDirectorySpaces.value.slice(0, 12))
const visibleSpaceItems = computed<ResolvedSpaceItem[]>(() => [
  ...configuredSpaceItems.value,
  ...visibleDirectorySpaces.value,
])
const hiddenDirectoryMatchCount = computed(() => (
  Math.max(filteredDirectorySpaces.value.length - visibleDirectorySpaces.value.length, 0)
))

async function saveSpaceMutation(action: () => Promise<void>, successMessage: string): Promise<void> {
  try {
    await action()
    setSpaceFeedback('success', successMessage)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save space settings.'
    setSpaceFeedback('error', message)
  }
}

async function addOrEnableConfiguredSpace(space: Pick<JiraSpaceDirectoryEntry, 'key' | 'name'>): Promise<void> {
  const configuredSpace = configuredSpaceByKey.value.get(space.key)
  const successMessage = configuredSpace?.enabled === false
    ? `Enabled space ${space.key}.`
    : `Added space ${space.key}.`

  await saveSpaceMutation(async () => {
    await addOrEnableSpace(space)
  }, successMessage)
}

async function addManualSpace(): Promise<void> {
  if (!canAddManualSpace.value) {
    return
  }

  const matchingDirectorySpace = directorySpaceByKey.value.get(normalizedNewSpaceKey.value)

  await addOrEnableConfiguredSpace({
    key: normalizedNewSpaceKey.value,
    name: matchingDirectorySpace?.name ?? normalizedNewSpaceKey.value,
  })

  if (spaceFeedback.value?.kind === 'success') {
    newSpaceKey.value = ''
  }
}

async function toggleConfiguredSpace(space: ResolvedSpaceItem): Promise<void> {
  if (!space.enabled) {
    await addOrEnableConfiguredSpace(space)
    return
  }

  await saveSpaceMutation(async () => {
    await disableSpace(space.key)
  }, `Disabled space ${space.key}.`)
}

async function saveCerebrasApiKey(): Promise<void> {
  if (!cerebrasApiKey.value.trim()) {
    setAiFeedback('error', 'Enter a Cerebras API key to save it.')
    return
  }

  try {
    await updateAiCredentials({
      cerebrasApiKey: cerebrasApiKey.value.trim(),
    })
    cerebrasApiKey.value = ''
    setAiFeedback('success', 'Saved local Cerebras API key.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save Cerebras API key.'
    setAiFeedback('error', message)
  }
}

async function saveJiraApiToken(): Promise<void> {
  if (!jiraApiToken.value.trim()) {
    setJiraFeedback('error', 'Enter a Jira API token to save it.')
    return
  }

  try {
    await updateJiraCredentials({
      apiToken: jiraApiToken.value.trim(),
    })
    jiraApiToken.value = ''
    setJiraFeedback('success', 'Saved Jira API token.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save Jira API token.'
    setJiraFeedback('error', message)
  }
}

onBeforeUnmount(() => {
  clearSpaceFeedbackTimeout()
  clearAiFeedbackTimeout()
  clearJiraFeedbackTimeout()
})
</script>

<template>
  <div class="animate-fade-in">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl text-white">Settings</h1>
        <p class="mt-1 text-sm text-slate-400">Configure your BetterJira experience</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-xl glass-card px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-white"
        @click="emit('close')"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Close
      </button>
    </div>

    <div class="space-y-8">
      <section class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div class="mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">AI Provider</h2>
          <p class="mt-2 text-xs text-slate-500">Choose the default model used by the AI description assistant. Your selection is saved in <code>.data/settings.json</code> so it survives restarts and app updates. Codex and Claude Code are detected from local CLI installs and run with low reasoning/effort for faster description generation.</p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="mb-2 block text-xs uppercase tracking-[0.14em] text-slate-500">Provider</span>
            <select
              :value="aiSettings.provider"
              class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
              @change="handleProviderChange"
            >
              <option
                v-for="provider in providers"
                :key="provider"
                :value="provider"
              >
                {{ getProviderLabel(provider) }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="mb-2 block text-xs uppercase tracking-[0.14em] text-slate-500">Model</span>
            <select
              :value="aiSettings.model"
              class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
              @change="handleModelChange"
            >
              <option
                v-for="model in availableModels"
                :key="model.id"
                :value="model.id"
              >
                {{ model.label }}
              </option>
            </select>
          </label>
        </div>

        <div class="mt-4 grid gap-2 md:grid-cols-2">
          <div
            v-for="providerStatus in providerAvailability"
            :key="providerStatus.provider"
            class="rounded-lg border px-3 py-2 text-xs"
            :class="getProviderStatusClass(providerStatus)"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium text-slate-200">{{ getProviderLabel(providerStatus.provider) }}</span>
              <span class="text-[10px] uppercase tracking-[0.16em]">{{ providerStatus.available ? 'Available' : 'Unavailable' }}</span>
            </div>
            <p class="mt-1 text-[11px] leading-relaxed opacity-80">{{ providerStatus.detail }}</p>
          </div>
        </div>
        <p v-if="isLoadingProviders" class="mt-3 text-xs text-slate-500">Checking local AI providers…</p>
        <p v-else-if="providerAvailabilityError" class="mt-3 text-xs text-rose-300">Unable to refresh local AI provider detection.</p>

        <div class="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Local Cerebras key</p>
          <p class="mt-2 text-xs text-slate-500">
            Optional. Store a local Cerebras API key in <code>.data/settings.json</code> for the Cerebras provider.
            <span v-if="aiConnection.hasCerebrasApiKey"> A key is already saved.</span>
          </p>
          <div class="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <input
              v-model="cerebrasApiKey"
              type="password"
              autocomplete="new-password"
              placeholder="Paste a new Cerebras API key"
              class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
            >
            <button
              class="rounded-lg border border-sky-400/20 bg-sky-400/15 px-4 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
              :disabled="isSavingSpaceSettings || !cerebrasApiKey.trim()"
              @click="saveCerebrasApiKey"
            >
              Save key
            </button>
          </div>
          <p
            v-if="aiFeedback"
            class="mt-3 rounded-lg px-3 py-2 text-xs"
            :class="aiFeedback.kind === 'success'
              ? 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
              : 'border border-rose-400/20 bg-rose-500/10 text-rose-200'"
          >
            {{ aiFeedback.message }}
          </p>
        </div>
      </section>

      <section class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div class="mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">Spaces</h2>
          <p class="mt-2 text-xs text-slate-500">Toggle spaces on to load their tickets. Sidebar space filters still work separately against the enabled spaces.</p>
        </div>

        <div class="space-y-6">
          <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p class="text-sm text-slate-200">Jira connection</p>
            <p class="mt-1 text-xs text-slate-500">
              {{ jiraConnectionSummary }}
            </p>
            <p class="mt-2 text-xs text-slate-500">
              Saved Jira credentials live in <code>.data/settings.json</code>. This screen shows the configured URL and email; the API token stays hidden.
            </p>
            <div class="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <div class="w-full space-y-2">
                <input
                  v-model="jiraApiToken"
                  type="password"
                  autocomplete="new-password"
                  placeholder="Paste a new Jira API token"
                  class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
                  @keydown.enter.prevent="saveJiraApiToken"
                >
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex text-xs text-sky-300 transition hover:text-sky-200"
                >
                  Create a Jira API token
                </a>
              </div>
              <button
                type="button"
                class="rounded-lg border border-sky-400/20 bg-sky-400/15 px-4 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                :disabled="isSavingSpaceSettings || !jiraApiToken.trim()"
                @click="saveJiraApiToken"
              >
                Update API key
              </button>
            </div>
            <p
              v-if="jiraFeedback"
              class="mt-3 rounded-lg px-3 py-2 text-xs"
              :class="jiraFeedback.kind === 'success'
                ? 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                : 'border border-rose-400/20 bg-rose-500/10 text-rose-200'"
            >
              {{ jiraFeedback.message }}
            </p>
          </div>

          <div class="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm text-slate-200">Manage spaces</p>
                <p class="mt-0.5 text-xs text-slate-500">Search Jira spaces, turn them on or off, and remove saved entries you no longer need.</p>
                <p v-if="!hasJiraCredentialsConfigured" class="mt-2 text-xs text-amber-300/80">
                  Complete Jira setup first to browse remote spaces.
                </p>
              </div>
              <p class="text-right text-[11px] uppercase tracking-[0.14em] text-slate-500">
                {{ spaces.length }} saved
              </p>
            </div>

            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.14em] text-slate-500">Search Jira spaces</span>
              <input
                v-model="spaceSearchQuery"
                type="text"
                placeholder="Search by space name or key"
                class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all placeholder:text-slate-500 focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
              />
            </label>

            <div v-if="isLoadingAvailableSpaces" class="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-3 text-xs text-slate-500">
              Loading Jira spaces…
            </div>

            <div v-if="availableSpacesErrorMessage" class="rounded-lg border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3 text-xs text-rose-300">
              {{ availableSpacesErrorMessage }}
            </div>

            <div v-if="visibleSpaceItems.length" class="space-y-2">
              <div
                v-for="space in visibleSpaceItems"
                :key="space.key"
                class="flex items-center justify-between gap-3 rounded-lg border px-3 py-3 transition-colors"
                :class="space.enabled
                  ? 'border-indigo-500/20 bg-indigo-500/[0.08]'
                  : 'border-white/[0.06] bg-white/[0.03]'"
              >
                <div class="min-w-0">
                  <div class="flex items-baseline gap-2 truncate">
                    <p class="truncate text-sm" :class="space.enabled ? 'text-indigo-100' : 'text-slate-200'">{{ space.name }}</p>
                    <p class="shrink-0 text-[11px] uppercase tracking-[0.14em]" :class="space.enabled ? 'text-indigo-300/70' : 'text-slate-500'">{{ space.key }}</p>
                  </div>
                  <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      v-if="!space.availableInDirectory"
                      class="rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-2 py-0.5 uppercase tracking-[0.14em] text-amber-200"
                    >
                      Manual
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  class="relative h-6 w-11 rounded-full transition-colors duration-200"
                  :class="space.enabled ? 'bg-indigo-500' : 'bg-white/[0.08]'"
                  role="switch"
                  :aria-checked="space.enabled"
                  :disabled="isSavingSpaceSettings"
                  @click="toggleConfiguredSpace(space)"
                >
                  <span
                    class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                    :class="space.enabled ? 'translate-x-5' : 'translate-x-0'"
                  />
                </button>
              </div>

              <p v-if="hiddenDirectoryMatchCount > 0" class="text-xs text-slate-500">
                Showing all saved spaces and the first {{ visibleDirectorySpaces.length }} Jira matches. Refine the search to narrow the list.
              </p>
            </div>

            <p v-else class="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-3 text-xs text-slate-500">
              No saved or accessible Jira spaces matched your search.
            </p>

            <div class="space-y-3 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-4">
              <div>
                <p class="text-sm text-slate-200">Manual fallback</p>
                <p class="mt-0.5 text-xs text-slate-500">Use this if the Jira picker does not include the space you need.</p>
              </div>

              <div class="flex gap-2">
                <input
                  v-model="newSpaceKey"
                  type="text"
                  placeholder="Add Jira space key"
                  class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm uppercase text-slate-200 outline-none transition-all placeholder:text-slate-500 focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
                  @keydown.enter.prevent="addManualSpace"
                />
                <button
                  type="button"
                  class="rounded-xl border px-4 py-2 text-xs font-medium transition-all"
                  :class="canAddManualSpace
                    ? 'border-indigo-500/20 bg-indigo-500/[0.1] text-indigo-200 hover:border-indigo-400/30 hover:text-white'
                    : 'border-white/[0.06] bg-white/[0.03] text-slate-500'"
                  :disabled="!canAddManualSpace || isSavingSpaceSettings"
                  @click="addManualSpace"
                >
                  {{ isSavingSpaceSettings ? 'Saving…' : manualAddButtonLabel }}
                </button>
              </div>
            </div>

            <p
              v-if="spaceFeedback"
              class="text-xs"
              :class="spaceFeedback.kind === 'success' ? 'text-emerald-300' : 'text-rose-300'"
            >
              {{ spaceFeedback.message }}
            </p>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div class="mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">AI Instructions</h2>
          <p class="mt-2 text-xs text-slate-500">Manage the prompt chips shown in the AI description assistant. Custom instructions are saved locally in <code>.data/settings.json</code>.</p>
        </div>

        <div class="space-y-3">
          <div
            v-for="preset in allInstructionPresets"
            :key="preset.id"
            class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4"
          >
            <div v-if="editingPresetId === preset.id" class="space-y-3">
              <input
                v-model="editingPreset.label"
                type="text"
                placeholder="Instruction label"
                class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
              />
              <textarea
                v-model="editingPreset.text"
                rows="4"
                placeholder="Instruction text"
                class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
              />
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
                  @click="cancelEditing"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="!canSaveEditedPreset"
                  @click="saveEditedPreset"
                >
                  Save
                </button>
              </div>
            </div>

            <div v-else class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <p class="text-sm text-slate-200">{{ preset.label }}</p>
                <p class="mt-1 text-xs leading-relaxed text-slate-500">{{ preset.text }}</p>
              </div>

              <div class="flex items-center gap-3">
                <button
                  type="button"
                  class="relative h-6 w-11 rounded-full transition-colors duration-200"
                  :class="preset.enabled ? 'bg-indigo-500' : 'bg-white/[0.08]'"
                  role="switch"
                  :aria-checked="preset.enabled"
                  @click="togglePresetEnabled(preset.id)"
                >
                  <span
                    class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                    :class="preset.enabled ? 'translate-x-5' : 'translate-x-0'"
                  />
                </button>

                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
                    @click="startEditing(preset.id)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="rounded-xl border border-rose-500/20 px-3 py-2 text-xs text-rose-300 transition hover:border-rose-500/40 hover:text-rose-200"
                    @click="removeLocalPreset(preset.id)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-4">
          <h3 class="text-sm text-slate-200">Add instruction</h3>
          <div class="mt-3 space-y-3">
            <input
              v-model="newPreset.label"
              type="text"
              placeholder="Instruction label"
              class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
            />
            <textarea
              v-model="newPreset.text"
              rows="4"
              placeholder="Instruction text"
              class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition-all focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20"
            />
            <div class="flex justify-end">
              <button
                type="button"
                class="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!canAddPreset"
                @click="saveNewPreset"
              >
                Add instruction
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
