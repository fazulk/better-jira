<script setup lang="ts">
import { computed } from 'vue'
import type { JiraTicket } from '@/types/jira'

const props = defineProps<{
  ticket: JiraTicket
  depth?: number
  index?: number
}>()
defineEmits<{ select: [key: string]; prefetch: [key: string] }>()

const issueType = computed(() => props.ticket.issueType?.toLowerCase() || 'task')

const accentClass = computed(() => {
  const type = issueType.value
  if (type.includes('epic')) return 'epic-accent'
  if (type.includes('bug')) return 'bug-accent'
  if (type.includes('story')) return 'story-accent'
  if (type.includes('sub')) return 'subtask-accent'
  return 'task-accent'
})

const badgeClass = computed(() => {
  const type = issueType.value
  if (type.includes('epic')) return 'issue-badge-epic'
  if (type.includes('bug')) return 'issue-badge-bug'
  if (type.includes('story')) return 'issue-badge-story'
  if (type.includes('sub')) return 'issue-badge-subtask'
  return 'issue-badge-task'
})

const statusColors: Record<string, string> = {
  new: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20',
  indeterminate: 'bg-amber-500/15 text-amber-300 border border-amber-500/20 status-glow-active',
  done: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 status-glow-done',
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  Highest: { color: 'bg-red-400', label: 'Highest' },
  High: { color: 'bg-orange-400', label: 'High' },
  Medium: { color: 'bg-yellow-400', label: 'Medium' },
  Low: { color: 'bg-sky-400', label: 'Low' },
  Lowest: { color: 'bg-slate-400', label: 'Lowest' },
}

const avatarColors = [
  'bg-indigo-500/30 text-indigo-300',
  'bg-amber-500/30 text-amber-300',
  'bg-emerald-500/30 text-emerald-300',
  'bg-rose-500/30 text-rose-300',
  'bg-sky-500/30 text-sky-300',
  'bg-violet-500/30 text-violet-300',
  'bg-teal-500/30 text-teal-300',
]

const avatarColor = computed(() => {
  if (!props.ticket.assignee || props.ticket.assignee === 'Unassigned') return 'bg-slate-500/20 text-slate-400'
  const hash = props.ticket.assignee.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return avatarColors[hash % avatarColors.length]
})

const initials = computed(() => {
  const name = props.ticket.assignee
  if (!name || name === 'Unassigned') return '?'
  const parts = name.split(/\s+/)
  if (parts.length >= 2) return parts[0][0] + parts[1][0]
  return name.slice(0, 2)
})

const isEpic = computed(() => issueType.value.includes('epic'))

const animDelay = computed(() => {
  const idx = props.index ?? 0
  return `${idx * 50}ms`
})
</script>

<template>
  <div
    class="glass-card group cursor-pointer rounded-xl animate-slide-up"
    :class="[accentClass, isEpic ? 'p-5' : 'p-4']"
    :style="{ animationDelay: animDelay }"
    @click="$emit('select', ticket.key)"
    @mouseenter="$emit('prefetch', ticket.key)"
  >
    <!-- Top row: key + badges -->
    <div class="flex items-center gap-2 mb-2">
      <span class="font-body text-[11px] font-medium tracking-wide text-slate-500">
        {{ ticket.key }}
      </span>
      <span
        class="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
        :class="badgeClass"
      >
        {{ ticket.issueType }}
      </span>
      <span
        class="rounded-full px-2 py-0.5 text-[10px] font-medium"
        :class="statusColors[ticket.statusCategory] || statusColors.indeterminate"
      >
        {{ ticket.status }}
      </span>
      <span
        v-if="ticket.parent && !depth"
        class="ml-auto truncate rounded-full bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[10px] text-slate-500"
      >
        {{ ticket.parent.key }}
      </span>
    </div>

    <!-- Summary -->
    <p
      class="font-body leading-snug text-slate-200 group-hover:text-white transition-colors"
      :class="isEpic ? 'font-display text-lg' : 'text-sm font-medium'"
    >
      {{ ticket.summary }}
    </p>

    <!-- Bottom row: priority + assignee -->
    <div class="mt-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span
          class="priority-dot"
          :class="priorityConfig[ticket.priority]?.color || 'bg-slate-500'"
        ></span>
        <span class="text-[11px] text-slate-500">{{ ticket.priority }}</span>
        <span v-if="ticket.parent && depth" class="text-[11px] text-slate-600">
          / {{ ticket.parent.key }}
        </span>
      </div>
      <div
        v-if="ticket.assignee && ticket.assignee !== 'Unassigned'"
        class="flex items-center gap-1.5"
      >
        <span class="text-[11px] text-slate-500">{{ ticket.assignee }}</span>
        <div class="avatar-placeholder" :class="avatarColor">
          {{ initials }}
        </div>
      </div>
    </div>
  </div>
</template>
