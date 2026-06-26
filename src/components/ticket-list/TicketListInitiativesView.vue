<script setup lang="ts">
import type { InitiativeRow, InitiativeRowFieldId, ProjectRow } from '@/features/ticket-list/types'

defineProps<{
  rows: InitiativeRow[]
  gridTemplate: string
  isFieldVisible: (field: InitiativeRowFieldId) => boolean
  getHealthClass: (health: ProjectRow['health']) => string
  getProgressBarClass: (health: ProjectRow['health']) => string
  getRelativeTimeLabel: (value?: string) => string
}>()

const emit = defineEmits<{
  openProjects: []
}>()
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div
      class="grid border-b border-white/[0.06] px-4 py-2 text-[12px] text-[#777a83]"
      :style="{ gridTemplateColumns: gridTemplate }"
    >
      <span>Name</span>
      <span v-if="isFieldVisible('health')">Health</span>
      <span v-if="isFieldVisible('lead')">Lead</span>
      <span v-if="isFieldVisible('projects')">Projects</span>
      <span v-if="isFieldVisible('issues')">Issues</span>
      <span v-if="isFieldVisible('updated')">Updated</span>
    </div>

    <div v-if="rows.length">
      <button
        v-for="initiative in rows"
        :key="initiative.id"
        type="button"
        class="linear-row grid min-h-12 w-full items-center px-4 py-2 text-left"
        :style="{ gridTemplateColumns: gridTemplate }"
        @click="emit('openProjects')"
      >
        <span class="min-w-0 pr-4">
          <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{
            initiative.name
          }}</span>
          <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{
            initiative.description
          }}</span>
        </span>

        <span v-if="isFieldVisible('health')">
          <span
            class="inline-flex rounded-full border px-2 py-0.5 text-[11px]"
            :class="getHealthClass(initiative.health)"
          >
            {{ initiative.health }}
          </span>
        </span>

        <span v-if="isFieldVisible('lead')" class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{
          initiative.lead
        }}</span>
        <span v-if="isFieldVisible('projects')" class="text-[12px] text-[#8f9198]">{{ initiative.projectCount }}
          {{ initiative.projectCount === 1 ? 'project' : 'projects' }}</span>

        <span v-if="isFieldVisible('issues')" class="pr-5">
          <span class="flex items-center justify-between gap-2 text-[11px] text-[#8f9198]">
            <span>{{ initiative.completedCount }}/{{ initiative.issueCount }}</span>
            <span>{{ initiative.progress }}%</span>
          </span>
          <span class="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span
              class="block h-full rounded-full"
              :class="getProgressBarClass(initiative.health)"
              :style="{ width: `${initiative.progress}%` }"
            />
          </span>
        </span>

        <span v-if="isFieldVisible('updated')" class="truncate text-[12px] text-[#777a83]">{{
          getRelativeTimeLabel(initiative.updatedAt)
        }}</span>
      </button>
    </div>

    <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
      <div class="max-w-sm">
        <p class="text-[13px] font-medium text-[#d7d8dc]">
          No initiatives found
        </p>
        <p class="mt-1 text-[12px] text-[#777a83]">
          Initiatives will appear when projects can be grouped into roadmap work.
        </p>
      </div>
    </div>
  </div>
</template>
