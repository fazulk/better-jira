<script setup lang="ts">
import type { JiraCreateIssueType } from '@/types/jira'

defineProps<{
  createIssueTypesError: string | null
  effectiveParentKey: string | null
  isCreatePending: boolean
  isIssueTypeLocked: boolean
  isLoadingIssueTypes: boolean
  isLocalSpace: boolean
  issueTypeOptions: JiraCreateIssueType[]
  getCreateIssueTypeLabel: (issueType: JiraCreateIssueType) => string
  getIssueTypeBadgeClass: (issueType: JiraCreateIssueType) => string
  selectedIssueType: JiraCreateIssueType
}>()

const emit = defineEmits<{
  'update:selectedIssueType': [issueType: JiraCreateIssueType]
}>()
</script>

<template>
  <div v-if="!isLocalSpace" class="space-y-1.5">
    <p class="text-[11px] uppercase tracking-[0.14em] text-slate-500">Subtype</p>
    <p v-if="effectiveParentKey && isLoadingIssueTypes" class="text-xs text-slate-500">
      Loading issue types available for this parent...
    </p>
    <p v-else-if="createIssueTypesError" class="text-xs text-rose-300">
      {{ createIssueTypesError }}
    </p>
    <p v-else-if="issueTypeOptions.length === 0" class="text-xs text-slate-500">
      No issue types are available for this parent.
    </p>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="issueType in issueTypeOptions"
        :key="issueType"
        type="button"
        class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition"
        :class="selectedIssueType === issueType
          ? getIssueTypeBadgeClass(issueType)
          : `${getIssueTypeBadgeClass(issueType)} opacity-60 hover:opacity-100`"
        :disabled="isIssueTypeLocked || isCreatePending"
        @click="emit('update:selectedIssueType', issueType)"
      >
        {{ getCreateIssueTypeLabel(issueType) }}
      </button>
    </div>
  </div>

  <div v-else class="space-y-1.5">
    <p class="text-[11px] uppercase tracking-[0.14em] text-slate-500">Subtype</p>
    <div
      class="inline-flex rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-xs font-medium text-slate-300"
    >
      Task
    </div>
  </div>
</template>
