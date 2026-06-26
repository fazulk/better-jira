<script setup lang="ts">
import type { JiraTicket } from '@/types/jira'
import { computed } from 'vue'
import { getStatusGroup } from '@/types/jira'

const props = defineProps<{
  ticket: JiraTicket
  selected: boolean
  checked: boolean
  showId?: boolean
  showStatus?: boolean
  showLabels?: boolean
  showPriority?: boolean
  showAssignee?: boolean
  showCreated?: boolean
  showUpdated?: boolean
  showDue?: boolean
  showParent?: boolean
}>()

defineEmits<{
  select: [key: string]
  prefetch: [key: string]
  toggleCheck: [key: string]
  copyKey: [key: string]
  createChild: [key: string]
}>()

const priorityClasses: Record<string, string> = {
  highest: 'text-[#f26d78]',
  high: 'text-[#e59356]',
  medium: 'text-[#d6a84b]',
  low: 'text-[#62a8d8]',
  lowest: 'text-[#8f9198]',
}

const MAX_VISIBLE_LABELS = 3

const statusClass = computed(() => {
  const group = getStatusGroup(props.ticket.statusCategory)
  if (group === 'done') {
    return 'border-[#4dbb83] text-[#4dbb83]'
  }
  if (group === 'new') {
    return 'border-[#8f9198] text-[#8f9198]'
  }
  return 'border-[#3f9fd6] text-[#3f9fd6]'
})

const priorityClass = computed(() => {
  const normalized = props.ticket.priority.trim().toLowerCase()
  return priorityClasses[normalized] ?? 'text-[#8f9198]'
})

const initials = computed(() => {
  const name = props.ticket.assignee
  if (!name || name === 'Unassigned')
    return ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length > 1) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
})

const createdLabel = computed(() => formatDate(props.ticket.createdAt))
const updatedLabel = computed(() => formatDate(props.ticket.updatedAt))
const dueLabel = computed(() => formatDate(props.ticket.dueDate))
const visibleLabels = computed(() => {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const label of props.ticket.labels ?? []) {
    const trimmed = label.trim()
    if (!trimmed || seen.has(trimmed))
      continue
    seen.add(trimmed)
    labels.push(trimmed)
  }
  return labels
})
const displayedLabels = computed(() => visibleLabels.value.slice(0, MAX_VISIBLE_LABELS))
const hiddenLabelCount = computed(() => Math.max(0, visibleLabels.value.length - displayedLabels.value.length))
const hiddenLabelSummary = computed(() => visibleLabels.value.slice(MAX_VISIBLE_LABELS).join(', '))
const rowIssueKey = computed(() => props.ticket.key)
const rowPrimarySummary = computed(() => props.ticket.summary)

const rowGridTemplate = computed(() => {
  const columns = ['18px']
  if (props.showStatus !== false)
    columns.push('18px')
  if (props.showId !== false)
    columns.push('82px')
  columns.push('minmax(0,1fr)')
  if (props.showLabels !== false && visibleLabels.value.length > 0)
    columns.push('auto')
  if (props.showPriority !== false)
    columns.push('auto')
  if (
    props.showAssignee !== false
    || props.showCreated !== false
    || props.showUpdated === true
    || props.showDue === true
  ) {
    columns.push('auto')
  }
  return columns.join(' ')
})

function formatDate(value: string | undefined): string {
  if (!value)
    return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return ''

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="linear-row group relative grid min-h-12 w-full cursor-default items-center gap-2 px-4 py-2.5 text-left transition"
    :class="selected ? 'linear-row-active text-[#f0f1f4]' : 'text-[#d6d7dc]'"
    :style="{ gridTemplateColumns: rowGridTemplate }"
    @mouseenter="$emit('prefetch', rowIssueKey)"
    @click="$emit('select', rowIssueKey)"
    @keydown.enter.prevent="$emit('select', rowIssueKey)"
    @keydown.space.prevent="$emit('select', rowIssueKey)"
  >
    <span
      class="flex h-4 w-4 items-center justify-center rounded border transition"
      :class="checked ? 'border-white/[0.18] bg-white/[0.08] text-slate-100' : 'border-white/[0.1] bg-white/[0.03] text-transparent group-hover:text-[#8f9198]'"
      role="checkbox"
      :aria-checked="checked"
      :aria-label="checked ? `Deselect ${rowIssueKey}` : `Select ${rowIssueKey}`"
      @click.stop="$emit('toggleCheck', rowIssueKey)"
    >
      <span v-if="checked" class="text-[10px] leading-none">✓</span>
    </span>

    <span v-if="showStatus !== false" class="flex h-4 w-4 items-center justify-center rounded-full border" :class="statusClass">
      <span class="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    </span>

    <span v-if="showId !== false" class="truncate font-medium text-[#8f9198]">{{ rowIssueKey }}</span>

    <span class="min-w-0 truncate">
      <span class="font-medium">{{ rowPrimarySummary }}</span>
    </span>

    <span v-if="showLabels !== false && visibleLabels.length > 0" class="hidden max-w-[28rem] flex-wrap items-center justify-end gap-1 md:flex">
      <LabelPill v-for="label in displayedLabels" :key="label" :label="label" dense show-dot />
      <span
        v-if="hiddenLabelCount > 0"
        class="inline-flex items-center rounded-xl border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[11px] font-medium leading-[1.25] text-slate-400"
        :title="hiddenLabelSummary"
      >
        +{{ hiddenLabelCount }}
      </span>
    </span>

    <span v-if="showPriority !== false" class="hidden min-w-0 items-center gap-1 text-[12px] text-[#8f9198] lg:flex">
      <span class="text-[13px]" :class="priorityClass">▮</span>
      <span class="max-w-24 truncate">{{ ticket.priority || 'No priority' }}</span>
    </span>

    <span
      v-if="showAssignee !== false || showCreated !== false || showUpdated === true || showDue === true"
      class="flex min-w-[94px] items-center justify-end gap-2 text-[12px] text-[#8f9198]"
    >
      <span v-if="showAssignee !== false && initials" class="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.08] text-[9px] text-[#c7c9d0]">{{ initials }}</span>
      <span v-if="showCreated !== false && createdLabel" class="hidden sm:inline">{{ createdLabel }}</span>
      <span v-if="showUpdated === true && updatedLabel" class="hidden sm:inline">{{ updatedLabel }}</span>
      <span v-if="showDue === true && dueLabel" class="hidden sm:inline">Due {{ dueLabel }}</span>
    </span>

    <span class="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 bg-gradient-to-l from-[#111215] via-[#111215] to-transparent pl-8 group-hover:flex group-focus-within:flex">
      <button
        type="button"
        class="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] bg-[#15161a] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
        :aria-label="`Copy issue ID ${rowIssueKey}`"
        title="Copy issue ID"
        @click.stop="$emit('copyKey', rowIssueKey)"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <path stroke-linecap="round" d="M8 10h4.5M8 14h8" />
          <circle cx="16.5" cy="10" r="1.25" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <button
        type="button"
        class="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] bg-[#15161a] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
        :aria-label="`Add child issue to ${rowIssueKey}`"
        @click.stop="$emit('createChild', rowIssueKey)"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </span>
  </div>
</template>
