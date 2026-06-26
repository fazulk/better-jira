<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { AiInstructionPresetDraft } from '@/composables/useAiInstructionPresets'
import { useAiInstructionPresets } from '@/composables/useAiInstructionPresets'
import { useAiSettings } from '@/composables/useAiSettings'
import { useJiraTickets } from '@/composables/useJiraTickets'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { getStatusGroup, type StatusGroup } from '@/types/jira'
import { getProviderLabel, isAiProvider, type AiProviderAvailability } from '~/shared/ai'

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
  updateJiraCredentials,
  updateAiCredentials,
} = useSpaceSettings()
const { tickets } = useJiraTickets()

const newPreset = ref<AiInstructionPresetDraft>({
  label: '',
  text: '',
})
const jiraBaseUrlDraft = ref('')
const jiraEmailDraft = ref('')
const cerebrasApiKey = ref('')
const jiraApiToken = ref('')
const settingsSearchQuery = ref('')
const aiFeedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)
const jiraFeedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)
let aiFeedbackTimeout: ReturnType<typeof setTimeout> | null = null
let jiraFeedbackTimeout: ReturnType<typeof setTimeout> | null = null

const editingPresetId = ref<string | null>(null)
const editingPreset = ref<AiInstructionPresetDraft>({
  label: '',
  text: '',
})

type SettingsSectionId =
  | 'workspace'
  | 'ai'
  | 'instructions'
  | 'team-overview'
  | 'team-members'
  | 'team-statuses'
  | 'team-workflows'
  | 'team-triage'
  | 'team-cycles'
  | 'team-ai'
  | 'danger'

interface SettingsNavigationItem {
  id: SettingsSectionId
  label: string
  description: string
}

interface SettingsNavigationGroup {
  label: string
  items: SettingsNavigationItem[]
}

interface SettingsSummaryRow {
  label: string
  value: string
  detail: string
}

interface SettingsDetailRow {
  label: string
  value: string
  detail: string
}

interface TeamStatusSettingsRow {
  status: string
  group: StatusGroup
  issueCount: number
  spaces: string
}

interface TeamMemberSettingsRow {
  teamKey: string
  teamName: string
  memberCount: number
  issueCount: number
  topMembers: string
}

const activeSettingsSection = ref<SettingsSectionId>('workspace')

const settingsNavigationGroups: SettingsNavigationGroup[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'workspace', label: 'Jira connection', description: 'Credentials' },
    ],
  },
  {
    label: 'Features',
    items: [
      { id: 'ai', label: 'AI provider', description: 'Models and local keys' },
      { id: 'instructions', label: 'AI instructions', description: 'Prompt presets' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'danger', label: 'Danger zone', description: 'Local data boundaries' },
    ],
  },
]

const filteredSettingsNavigationGroups = computed<SettingsNavigationGroup[]>(() => {
  const query = settingsSearchQuery.value.trim().toLowerCase()
  if (!query) return settingsNavigationGroups

  return settingsNavigationGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => [
        group.label,
        item.label,
        item.description,
      ].some(value => value.toLowerCase().includes(query))),
    }))
    .filter(group => group.items.length > 0)
})

const canAddPreset = computed<boolean>(() =>
  newPreset.value.label.trim().length > 0 && newPreset.value.text.trim().length > 0,
)

const canSaveEditedPreset = computed<boolean>(() =>
  editingPreset.value.label.trim().length > 0 && editingPreset.value.text.trim().length > 0,
)

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
    ? 'border-white/[0.08] bg-white/[0.035] text-slate-300'
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
const enabledSpaceItems = computed(() => spaces.value
  .filter(space => space.enabled)
  .map(space => ({
    key: space.key,
    name: space.name.trim() || space.key,
  })))
const enabledSpaceKeySet = computed(() => new Set(enabledSpaceItems.value.map(space => space.key)))
const teamSettingsRows = computed<SettingsSummaryRow[]>(() => enabledSpaceItems.value.map(space => ({
  label: space.name,
  value: space.key,
  detail: 'Visible in the sidebar',
})))
const workspaceSummaryRows = computed<SettingsSummaryRow[]>(() => [
  {
    label: 'Connection',
    value: hasJiraCredentialsConfigured.value ? 'Configured' : 'Incomplete',
    detail: jiraConnection.value.baseUrl || 'No Jira base URL saved',
  },
  {
    label: 'Enabled spaces',
    value: String(enabledSpaceItems.value.length),
    detail: enabledSpaceItems.value.length === 1 ? '1 space visible in the sidebar' : `${enabledSpaceItems.value.length} spaces visible in the sidebar`,
  },
  {
    label: 'AI provider',
    value: getProviderLabel(aiSettings.value.provider),
    detail: aiSettings.value.model,
  },
])

const enabledTickets = computed(() => tickets.value.filter(ticket => enabledSpaceKeySet.value.has(ticket.spaceKey)))

const statusGroupLabels: Record<StatusGroup, string> = {
  new: 'Todo',
  indeterminate: 'In progress',
  done: 'Done',
}

const statusGroupRank: Record<StatusGroup, number> = {
  new: 0,
  indeterminate: 1,
  done: 2,
}

const teamStatusRows = computed<TeamStatusSettingsRow[]>(() => {
  const rows = new Map<string, {
    status: string
    group: StatusGroup
    issueCount: number
    spaceKeys: Set<string>
  }>()

  for (const ticket of tickets.value) {
    if (!enabledSpaceKeySet.value.has(ticket.spaceKey)) {
      continue
    }

    const status = ticket.status.trim() || 'No status'
    const group = getStatusGroup(ticket.statusCategory)
    const key = `${group}:${status.toLowerCase()}`
    const current = rows.get(key)

    if (current) {
      current.issueCount += 1
      current.spaceKeys.add(ticket.spaceKey)
      continue
    }

    rows.set(key, {
      status,
      group,
      issueCount: 1,
      spaceKeys: new Set([ticket.spaceKey]),
    })
  }

  return [...rows.values()]
    .sort((left, right) => (
      statusGroupRank[left.group] - statusGroupRank[right.group]
      || left.status.localeCompare(right.status)
    ))
    .map(row => ({
      status: row.status,
      group: row.group,
      issueCount: row.issueCount,
      spaces: [...row.spaceKeys].sort().join(', '),
    }))
})

const teamMemberRows = computed<TeamMemberSettingsRow[]>(() => enabledSpaceItems.value.map(space => {
  const teamTickets = tickets.value.filter(ticket => ticket.spaceKey === space.key)
  const memberIssueCounts = new Map<string, number>()

  for (const ticket of teamTickets) {
    const name = ticket.assignee.trim() || 'Unassigned'
    memberIssueCounts.set(name, (memberIssueCounts.get(name) ?? 0) + 1)
  }

  const topMembers = [...memberIssueCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([name, issueCount]) => `${name} (${issueCount})`)
    .join(', ')

  return {
    teamKey: space.key,
    teamName: space.name,
    memberCount: memberIssueCounts.size,
    issueCount: teamTickets.length,
    topMembers: topMembers || 'No assignees yet',
  }
}))

const activeIssueCount = computed(() => (
  enabledTickets.value.filter(ticket => getStatusGroup(ticket.statusCategory) !== 'done').length
))
const triageIssueCount = computed(() => (
  enabledTickets.value.filter(ticket => getStatusGroup(ticket.statusCategory) === 'new').length
))
const backlogIssueCount = computed(() => (
  enabledTickets.value.filter(ticket => !ticket.inCurrentSprint && getStatusGroup(ticket.statusCategory) !== 'done').length
))
const currentSprintIssueCount = computed(() => (
  enabledTickets.value.filter(ticket => ticket.inCurrentSprint && getStatusGroup(ticket.statusCategory) !== 'done').length
))

const enabledInstructionPresetCount = computed(() => (
  allInstructionPresets.value.filter(preset => preset.enabled).length
))

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

const teamWorkflowRows = computed<SettingsDetailRow[]>(() => [
  {
    label: 'Workflow statuses',
    value: formatCount(teamStatusRows.value.length, 'status', 'statuses'),
    detail: 'Loaded from Jira and grouped into Linear-style Todo, In progress, and Done categories.',
  },
  {
    label: 'Active work',
    value: formatCount(activeIssueCount.value, 'issue', 'issues'),
    detail: 'Issues from enabled spaces that are not in a completed Jira status category.',
  },
  {
    label: 'Status transitions',
    value: 'Jira managed',
    detail: 'Issue status changes continue to use Jira transitions from the selected issue.',
  },
])
const teamTriageRows = computed<SettingsDetailRow[]>(() => [
  {
    label: 'Triage source',
    value: formatCount(triageIssueCount.value, 'issue', 'issues'),
    detail: 'Issues in Jira Todo status categories appear in team triage views.',
  },
  {
    label: 'Routing',
    value: 'By team',
    detail: 'Jira spaces define the Linear-style team boundary for intake and issue views.',
  },
])
const teamCycleRows = computed<SettingsDetailRow[]>(() => [
  {
    label: 'Current sprint',
    value: formatCount(currentSprintIssueCount.value, 'issue', 'issues'),
    detail: 'Jira sprint membership is surfaced as issue metadata and filters only.',
  },
  {
    label: 'Backlog',
    value: formatCount(backlogIssueCount.value, 'issue', 'issues'),
    detail: 'Active issues outside the current Jira sprint appear in backlog-style views.',
  },
  {
    label: 'Linear cycles',
    value: 'Deferred',
    detail: 'Full cycle planning remains out of scope until this app has a dedicated cycle model.',
  },
])
const teamAiRows = computed<SettingsDetailRow[]>(() => [
  {
    label: 'Description assistant',
    value: formatCount(enabledInstructionPresetCount.value, 'preset', 'presets'),
    detail: 'Enabled prompt presets are available from the issue description assistant.',
  },
  {
    label: 'Provider',
    value: getProviderLabel(aiSettings.value.provider),
    detail: aiSettings.value.model,
  },
  {
    label: 'Agent chat',
    value: 'Out of scope',
    detail: 'Linear-style agent chat is intentionally excluded from the first pass.',
  },
])
const dangerRows = computed<SettingsDetailRow[]>(() => [
  {
    label: 'Credential storage',
    value: '.data/settings.json',
    detail: 'Jira and AI credentials stay in the existing local settings boundary.',
  },
  {
    label: 'Local issue state',
    value: 'Browser storage',
    detail: 'Pinned tickets, inbox read state, and archived notifications remain local to this workspace.',
  },
  {
    label: 'Destructive actions',
    value: 'Not exposed',
    detail: 'No reset or delete workspace action is available from this first-pass settings shell.',
  },
])
const constrainedSettingsSectionTitle = computed(() => {
  if (activeSettingsSection.value === 'team-workflows') return 'Workflows'
  if (activeSettingsSection.value === 'team-triage') return 'Triage'
  if (activeSettingsSection.value === 'team-cycles') return 'Cycles'
  if (activeSettingsSection.value === 'team-ai') return 'AI & Agents'
  return 'Danger zone'
})
const constrainedSettingsSectionDescription = computed(() => {
  if (activeSettingsSection.value === 'team-workflows') return 'Workflow behavior inferred from enabled Jira spaces.'
  if (activeSettingsSection.value === 'team-triage') return 'How intake-like issue views are derived from Jira data.'
  if (activeSettingsSection.value === 'team-cycles') return 'Sprint-backed metadata without full Linear cycle planning.'
  if (activeSettingsSection.value === 'team-ai') return 'Assistant capabilities available in this first pass.'
  return 'Local storage and destructive action boundaries.'
})
const constrainedSettingsRows = computed<SettingsDetailRow[]>(() => {
  if (activeSettingsSection.value === 'team-workflows') return teamWorkflowRows.value
  if (activeSettingsSection.value === 'team-triage') return teamTriageRows.value
  if (activeSettingsSection.value === 'team-cycles') return teamCycleRows.value
  if (activeSettingsSection.value === 'team-ai') return teamAiRows.value
  return dangerRows.value
})

watch(jiraConnection, (connection) => {
  jiraBaseUrlDraft.value = connection.baseUrl
  jiraEmailDraft.value = connection.email
}, { immediate: true })

const canSaveJiraConnectionDetails = computed(() => (
  !isSavingSpaceSettings.value
  && jiraBaseUrlDraft.value.trim().length > 0
  && jiraEmailDraft.value.trim().length > 0
  && (
    jiraBaseUrlDraft.value.trim() !== jiraConnection.value.baseUrl
    || jiraEmailDraft.value.trim() !== jiraConnection.value.email
  )
))

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

async function saveJiraConnectionDetails(): Promise<void> {
  if (!jiraBaseUrlDraft.value.trim() || !jiraEmailDraft.value.trim()) {
    setJiraFeedback('error', 'Enter a Jira URL and email to save connection details.')
    return
  }

  try {
    await updateJiraCredentials({
      baseUrl: jiraBaseUrlDraft.value.trim(),
      email: jiraEmailDraft.value.trim(),
    })
    setJiraFeedback('success', 'Saved Jira connection details.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save Jira connection details.'
    setJiraFeedback('error', message)
  }
}

onBeforeUnmount(() => {
  clearAiFeedbackTimeout()
  clearJiraFeedbackTimeout()
})
</script>

<template>
  <div class="flex h-full flex-col animate-fade-in bg-surface-0">
    <div class="z-20 flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] bg-surface-0/95 px-4 backdrop-blur">
      <button
        class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-100"
        @click="emit('close')"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 18l-6-6 6-6" />
        </svg>
        Back to app
      </button>
      <div class="text-xs font-medium text-slate-300">Settings</div>
      <div class="w-20"></div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside class="overflow-y-auto border-b border-white/[0.06] px-4 py-5 lg:border-b-0 lg:border-r lg:border-white/[0.06]">
        <div class="mb-5 px-2">
          <h1 class="text-lg font-semibold text-slate-100">Settings</h1>
          <p class="mt-1 text-xs text-slate-500">LifeMD workspace</p>
        </div>
        <label class="mb-4 block px-2">
          <span class="sr-only">Search settings</span>
          <input
            v-model="settingsSearchQuery"
            type="search"
            name="settings-search"
            placeholder="Search settings"
            class="w-full rounded-md border border-white/[0.06] bg-white/[0.035] px-2.5 py-1.5 text-[12px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-white/[0.16] focus:bg-white/[0.05]"
          >
        </label>
        <nav class="space-y-5">
          <section v-for="group in filteredSettingsNavigationGroups" :key="group.label">
            <h2 class="mb-1.5 px-2.5 text-[11px] font-medium text-slate-600">{{ group.label }}</h2>
            <div class="space-y-0.5">
              <button
                v-for="item in group.items"
                :key="item.id"
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition"
                :class="activeSettingsSection === item.id
                  ? 'bg-white/[0.06] text-slate-100'
                  : 'text-slate-500 hover:bg-white/[0.035] hover:text-slate-300'"
                @click="activeSettingsSection = item.id"
              >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="activeSettingsSection === item.id ? 'bg-accent-indigo' : 'bg-slate-700'"></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13px] font-medium">{{ item.label }}</span>
                  <span class="mt-0.5 block truncate text-[11px] text-slate-600">{{ item.description }}</span>
                </span>
              </button>
            </div>
          </section>
          <p
            v-if="!filteredSettingsNavigationGroups.length"
            class="px-2.5 py-2 text-[12px] text-slate-600"
          >
            No settings found.
          </p>
        </nav>
      </aside>

      <main class="min-w-0 overflow-y-auto px-5 py-8 lg:px-10">
        <section v-show="activeSettingsSection === 'ai'" class="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">AI provider</h2>
          <p class="mt-1 text-sm text-slate-500">Choose the model used by the AI description assistant.</p>
        </div>

        <div class="rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div class="grid gap-0 divide-y divide-white/[0.06] md:grid-cols-2 md:divide-x md:divide-y-0">
            <label class="block p-4">
              <span class="mb-2 block text-xs font-medium text-slate-500">Provider</span>
              <select
                :value="aiSettings.provider"
                name="ai-provider"
                class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
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

            <label class="block p-4">
              <span class="mb-2 block text-xs font-medium text-slate-500">Model</span>
              <select
                :value="aiSettings.model"
                name="ai-model"
                class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
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
        </div>

        <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-medium text-slate-200">Provider availability</h3>
              <p class="mt-0.5 text-xs text-slate-500">Local CLI detection for AI enhancement.</p>
            </div>
            <span v-if="isLoadingProviders" class="text-xs text-slate-500">Checking...</span>
          </div>
          <div class="grid gap-2 md:grid-cols-2">
            <div
              v-for="providerStatus in providerAvailability"
              :key="providerStatus.provider"
              class="rounded-md border px-3 py-2 text-xs"
              :class="getProviderStatusClass(providerStatus)"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium text-slate-200">{{ getProviderLabel(providerStatus.provider) }}</span>
                <span class="text-[10px] uppercase tracking-[0.16em]">{{ providerStatus.available ? 'Available' : 'Unavailable' }}</span>
              </div>
              <p class="mt-1 text-[11px] leading-relaxed opacity-80">{{ providerStatus.detail }}</p>
            </div>
          </div>
          <p v-if="providerAvailabilityError" class="mt-3 text-xs text-rose-300">Unable to refresh local AI provider detection.</p>
        </div>

        <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <p class="text-sm font-medium text-slate-200">Local Cerebras key</p>
          <p class="mt-1 text-xs text-slate-500">
            Optional. Store a local Cerebras API key in <code>.data/settings.json</code> for the Cerebras provider.
            <span v-if="aiConnection.hasCerebrasApiKey"> A key is already saved.</span>
          </p>
          <div class="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <input
              v-model="cerebrasApiKey"
              type="password"
              name="cerebras-api-key"
              autocomplete="new-password"
              placeholder="Paste a new Cerebras API key"
              class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
            >
            <button
              class="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/[0.14] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
              :disabled="isSavingSpaceSettings || !cerebrasApiKey.trim()"
              @click="saveCerebrasApiKey"
            >
              Save key
            </button>
          </div>
          <p
            v-if="aiFeedback"
            class="mt-3 rounded-md px-3 py-2 text-xs"
            :class="aiFeedback.kind === 'success'
              ? 'border border-white/[0.08] bg-white/[0.035] text-slate-300'
              : 'border border-rose-400/20 bg-rose-500/10 text-rose-200'"
          >
            {{ aiFeedback.message }}
          </p>
        </div>
      </section>

      <section v-show="activeSettingsSection === 'workspace'" class="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">Workspace</h2>
          <p class="mt-1 text-sm text-slate-500">Manage Jira connection details.</p>
        </div>

        <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
            <p class="text-sm font-medium text-slate-200">Jira connection</p>
            <p class="mt-1 text-xs text-slate-500">
              {{ jiraConnectionSummary }}
            </p>
            <p class="mt-2 text-xs text-slate-500">
              Saved Jira credentials live in <code>.data/settings.json</code>. The API token stays hidden after saving.
            </p>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-500">Jira URL</span>
                <input
                  v-model="jiraBaseUrlDraft"
                  type="url"
                  name="jira-base-url"
                  autocomplete="url"
                  placeholder="https://example.atlassian.net"
                  class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-white/[0.16] focus:bg-white/[0.06]"
                  @keydown.enter.prevent="saveJiraConnectionDetails"
                >
              </label>
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-500">Atlassian email</span>
                <input
                  v-model="jiraEmailDraft"
                  type="email"
                  name="jira-email"
                  autocomplete="email"
                  placeholder="you@example.com"
                  class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-white/[0.16] focus:bg-white/[0.06]"
                  @keydown.enter.prevent="saveJiraConnectionDetails"
                >
              </label>
            </div>
            <div class="mt-3 flex justify-end">
              <button
                type="button"
                class="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/[0.14] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
                :disabled="!canSaveJiraConnectionDetails"
                @click="saveJiraConnectionDetails"
              >
                Save connection
              </button>
            </div>
            <div class="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 md:flex-row md:items-center">
              <div class="w-full space-y-2">
                <input
                  v-model="jiraApiToken"
                  type="password"
                  name="jira-api-token"
                  autocomplete="new-password"
                  placeholder="Paste a new Jira API token"
                  class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
                  @keydown.enter.prevent="saveJiraApiToken"
                >
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex text-xs text-slate-400 transition hover:text-slate-200"
                >
                  Create a Jira API token
                </a>
              </div>
              <button
                type="button"
                class="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/[0.14] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
                :disabled="isSavingSpaceSettings || !jiraApiToken.trim()"
                @click="saveJiraApiToken"
              >
                Update API key
              </button>
            </div>
            <p
              v-if="jiraFeedback"
              class="mt-3 rounded-md px-3 py-2 text-xs"
            :class="jiraFeedback.kind === 'success'
                ? 'border border-white/[0.08] bg-white/[0.035] text-slate-300'
                : 'border border-rose-400/20 bg-rose-500/10 text-rose-200'"
            >
              {{ jiraFeedback.message }}
            </p>
          </div>

      </section>

      <section v-show="activeSettingsSection === 'team-overview'" class="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">Teams</h2>
          <p class="mt-1 text-sm text-slate-500">Enabled spaces organized as workspace teams.</p>
        </div>

        <div class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div
            v-for="team in teamSettingsRows"
            :key="team.value"
            class="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_7rem_10rem]"
          >
            <p class="truncate text-sm font-medium text-slate-200">{{ team.label }}</p>
            <p class="text-sm text-slate-500">{{ team.value }}</p>
            <p class="text-sm text-slate-500">{{ team.detail }}</p>
          </div>
          <p v-if="!teamSettingsRows.length" class="px-4 py-6 text-sm text-slate-500">No enabled Jira spaces.</p>
        </div>
      </section>

      <section v-show="activeSettingsSection === 'team-members'" class="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">Team members</h2>
          <p class="mt-1 text-sm text-slate-500">Membership is inferred from Jira issue assignees and enabled spaces.</p>
        </div>

        <div class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div
            v-for="team in teamMemberRows"
            :key="team.teamKey"
            class="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_7rem_8rem]"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-slate-200">{{ team.teamName }}</p>
              <p class="mt-0.5 truncate text-xs text-slate-500">{{ team.topMembers }}</p>
            </div>
            <p class="text-sm text-slate-500">{{ team.memberCount }} {{ team.memberCount === 1 ? 'member' : 'members' }}</p>
            <p class="text-right text-sm text-slate-500">{{ team.issueCount }} {{ team.issueCount === 1 ? 'issue' : 'issues' }}</p>
          </div>
          <p v-if="!teamMemberRows.length" class="px-4 py-6 text-sm text-slate-500">
            No enabled Jira spaces.
          </p>
        </div>
      </section>

      <section v-show="activeSettingsSection === 'team-statuses'" class="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">Issue statuses</h2>
          <p class="mt-1 text-sm text-slate-500">Statuses currently loaded from enabled Jira spaces.</p>
        </div>

        <div class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div
            v-for="statusRow in teamStatusRows"
            :key="`${statusRow.group}-${statusRow.status}`"
            class="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)_7rem]"
          >
            <p class="truncate text-sm font-medium text-slate-200">{{ statusRow.status }}</p>
            <p class="text-sm text-slate-500">
              {{ statusGroupLabels[statusRow.group] }} · {{ statusRow.spaces || 'No space' }}
            </p>
            <p class="text-right text-xs text-slate-600">
              {{ statusRow.issueCount }} {{ statusRow.issueCount === 1 ? 'issue' : 'issues' }}
            </p>
          </div>
          <p v-if="!teamStatusRows.length" class="px-4 py-6 text-sm text-slate-500">
            No issue statuses loaded yet.
          </p>
        </div>
      </section>

      <section v-show="activeSettingsSection === 'team-workflows' || activeSettingsSection === 'team-triage' || activeSettingsSection === 'team-cycles' || activeSettingsSection === 'team-ai' || activeSettingsSection === 'danger'" class="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">{{ constrainedSettingsSectionTitle }}</h2>
          <p class="mt-1 text-sm text-slate-500">{{ constrainedSettingsSectionDescription }}</p>
        </div>

        <div class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div
            v-for="row in constrainedSettingsRows"
            :key="row.label"
            class="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_10rem]"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-slate-200">{{ row.label }}</p>
              <p class="mt-0.5 text-xs leading-5 text-slate-500">{{ row.detail }}</p>
            </div>
            <p class="text-left text-sm text-slate-400 md:text-right">{{ row.value }}</p>
          </div>
        </div>
      </section>

      <section v-show="activeSettingsSection === 'instructions'" class="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">AI instructions</h2>
          <p class="mt-1 text-sm text-slate-500">Manage the prompt chips shown in the AI description assistant.</p>
        </div>

        <div class="space-y-3">
          <div
            v-for="preset in allInstructionPresets"
            :key="preset.id"
            class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4"
          >
            <div v-if="editingPresetId === preset.id" class="space-y-3">
              <input
                v-model="editingPreset.label"
                type="text"
                name="editing-preset-label"
                placeholder="Instruction label"
                class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
              />
              <textarea
                v-model="editingPreset.text"
                name="editing-preset-text"
                rows="4"
                placeholder="Instruction text"
                class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
              />
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
                  @click="cancelEditing"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-md bg-accent-indigo px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60"
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
                  :class="preset.enabled ? 'bg-accent-indigo' : 'bg-white/[0.08]'"
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
                    class="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
                    @click="startEditing(preset.id)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-rose-500/20 px-3 py-1.5 text-xs text-rose-300 transition hover:border-rose-500/40 hover:text-rose-200"
                    @click="removeLocalPreset(preset.id)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] p-4">
          <h3 class="text-sm font-medium text-slate-200">Add instruction</h3>
          <div class="mt-3 space-y-3">
            <input
              v-model="newPreset.label"
              type="text"
              name="new-preset-label"
              placeholder="Instruction label"
              class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
            />
            <textarea
              v-model="newPreset.text"
              name="new-preset-text"
              rows="4"
              placeholder="Instruction text"
              class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
            />
            <div class="flex justify-end">
              <button
                type="button"
                class="rounded-md bg-accent-indigo px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!canAddPreset"
                @click="saveNewPreset"
              >
                Add instruction
              </button>
            </div>
          </div>
        </div>
      </section>

      </main>
    </div>
  </div>
</template>
