<script setup lang="ts">
import type { JiraTicket } from '@/types/jira'
import { computed, ref } from 'vue'
import TicketDetailPropertiesSection from '@/components/ticket-detail/TicketDetailPropertiesSection.vue'

const props = defineProps<{
  isLocalTicket: boolean
  isProjectDetail: boolean
  jiraDataEnabled: boolean
  ticket: JiraTicket
}>()

const emit = defineEmits<{
  prefetch: [key: string]
  select: [key: string]
}>()

const copiedKey = ref(false)
const copiedUrl = ref(false)
const propertiesRef = ref<InstanceType<typeof TicketDetailPropertiesSection> | null>(null)
const collapsedSections = ref({
  properties: false,
  labels: false,
  project: false,
  jira: false,
})

const JIRA_BASE_URL = 'https://lifemd.atlassian.net'
const jiraUrl = computed(() => `${JIRA_BASE_URL}/browse/${props.ticket.key}`)
const detailJiraTypeLabel = computed(() => (
  !props.isLocalTicket && props.ticket.issueType ? props.ticket.issueType : null
))
const detailProjectParent = computed(() => {
  const parent = props.ticket.parent
  if (!parent || !parent.issueType.toLowerCase().includes('epic'))
    return null
  return parent
})
const detailProjectParentLabel = computed(() => detailProjectParent.value?.summary ?? '')
const detailLabels = computed(() => {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const label of props.ticket.labels ?? []) {
    const trimmed = label.trim()
    const normalized = trimmed.toLowerCase()
    if (!trimmed || seen.has(normalized))
      continue
    seen.add(normalized)
    labels.push(trimmed)
  }
  return labels
})

function toggleSection(section: keyof typeof collapsedSections.value) {
  collapsedSections.value[section] = !collapsedSections.value[section]
}

async function copyJiraUrl() {
  await navigator.clipboard.writeText(jiraUrl.value)
  copiedUrl.value = true
  setTimeout(() => {
    copiedUrl.value = false
  }, 1500)
}

async function copyTicketKey() {
  await navigator.clipboard.writeText(props.ticket.key)
  copiedKey.value = true
  setTimeout(() => {
    copiedKey.value = false
  }, 1500)
}

function startEditingAssignee() {
  return propertiesRef.value?.startEditingAssignee()
}

function startEditingPriority() {
  return propertiesRef.value?.startEditingPriority()
}

function startEditingStatus() {
  return propertiesRef.value?.startEditingStatus()
}

defineExpose({
  startEditingAssignee,
  startEditingPriority,
  startEditingStatus,
})
</script>

<template>
  <aside class="border-t border-white/[0.06] bg-issue-detail-bg px-4 py-4 lg:border-t-0">
    <div class="space-y-3">
      <div v-if="!isLocalTicket" class="flex justify-end gap-1.5">
        <button
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
          :aria-label="`Copy Jira link for ${ticket.key}`"
          title="Copy Jira link"
          @click="copyJiraUrl"
        >
          <svg v-if="!copiedUrl" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
          </svg>
          <svg v-else class="h-3.5 w-3.5 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
          :aria-label="`Copy issue ID ${ticket.key}`"
          title="Copy issue ID"
          @click="copyTicketKey"
        >
          <svg v-if="!copiedKey" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
            <path stroke-linecap="round" d="M8 10h4.5M8 14h8" />
            <circle cx="16.5" cy="10" r="1.25" fill="currentColor" stroke="none" />
          </svg>
          <svg v-else class="h-3.5 w-3.5 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>

      <TicketDetailPropertiesSection
        ref="propertiesRef"
        :collapsed="collapsedSections.properties"
        :is-local-ticket="isLocalTicket"
        :jira-data-enabled="jiraDataEnabled"
        :ticket="ticket"
        :ticket-key="ticket.key"
        @toggle="toggleSection('properties')"
      />

      <section
        class="rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 transition-[padding]"
        :class="collapsedSections.labels ? 'py-3' : 'py-4'"
      >
        <button
          type="button"
          class="flex w-full items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
          :class="{ 'mb-3': !collapsedSections.labels }"
          :aria-expanded="!collapsedSections.labels"
          @click="toggleSection('labels')"
        >
          <span>Labels</span>
          <span class="text-[10px] text-slate-600 transition-transform" :class="{ '-rotate-90': collapsedSections.labels }">▼</span>
        </button>

        <div v-show="!collapsedSections.labels" class="flex flex-wrap items-center gap-2">
          <LabelPill
            v-for="label in detailLabels"
            :key="label"
            :label="label"
            show-dot
          />
          <span v-if="detailLabels.length === 0" class="text-sm text-slate-600">No labels</span>
          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
            title="Editing labels is not available yet"
            aria-label="Add label"
          >
            +
          </button>
        </div>
      </section>

      <section
        v-if="!isProjectDetail"
        class="rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 transition-[padding]"
        :class="collapsedSections.project ? 'py-3' : 'py-4'"
      >
        <button
          type="button"
          class="flex w-full items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
          :class="{ 'mb-3': !collapsedSections.project }"
          :aria-expanded="!collapsedSections.project"
          @click="toggleSection('project')"
        >
          <span>Project</span>
          <span class="text-[10px] text-slate-600 transition-transform" :class="{ '-rotate-90': collapsedSections.project }">▼</span>
        </button>

        <div v-show="!collapsedSections.project">
          <button
            v-if="detailProjectParent"
            type="button"
            class="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-left transition hover:bg-white/[0.04]"
            @click="emit('select', detailProjectParent.key)"
            @mouseenter="emit('prefetch', detailProjectParent.key)"
          >
            <span class="flex h-5 w-5 shrink-0 items-center justify-center text-[#9aa8c7]">
              <Icon name="lucide:rocket" class="h-4 w-4" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-slate-200">{{ detailProjectParentLabel }}</span>
            </span>
          </button>
          <button
            v-else
            type="button"
            class="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-left text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
          >
            <span class="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                <path stroke-linejoin="round" d="m8 1.8 5.2 3v6L8 13.8l-5.2-3v-6L8 1.8Z" />
                <path stroke-linejoin="round" d="M2.9 4.9 8 7.8l5.1-2.9M8 7.8v5.8" />
              </svg>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">Add to project</span>
            </span>
          </button>
        </div>
      </section>

      <section
        class="rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 transition-[padding]"
        :class="collapsedSections.jira ? 'py-3' : 'py-4'"
      >
        <button
          type="button"
          class="flex w-full items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
          :class="{ 'mb-3': !collapsedSections.jira }"
          :aria-expanded="!collapsedSections.jira"
          @click="toggleSection('jira')"
        >
          <span>Jira</span>
          <span class="text-[10px] text-slate-600 transition-transform" :class="{ '-rotate-90': collapsedSections.jira }">▼</span>
        </button>

        <div v-show="!collapsedSections.jira" class="space-y-2 text-sm">
          <div v-if="detailJiraTypeLabel" class="flex items-center">
            <span class="inline-flex max-w-full justify-self-start rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-xs font-medium text-slate-400">
              <span class="truncate">{{ detailJiraTypeLabel }}</span>
            </span>
          </div>
          <a
            v-if="!isLocalTicket"
            :href="jiraUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex h-7 items-center rounded-md border border-white/[0.08] px-2.5 text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
          >
            Open in Jira
          </a>
        </div>
      </section>
    </div>
  </aside>
</template>
