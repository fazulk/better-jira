<script setup lang="ts">
import type { SavedViewRow, SavedViewRowFieldId } from '@/features/ticket-list/types'

defineProps<{
  rows: SavedViewRow[]
  gridTemplate: string
  isFieldVisible: (field: SavedViewRowFieldId) => boolean
  getRelativeTimeLabel: (value?: string) => string
}>()

const emit = defineEmits<{
  open: [viewId: string]
}>()
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div
      class="grid border-b border-white/[0.06] px-4 py-2 text-[12px] text-[#777a83]"
      :style="{ gridTemplateColumns: gridTemplate }"
    >
      <span>Name</span>
      <span v-if="isFieldVisible('type')">Type</span>
      <span v-if="isFieldVisible('items')">Items</span>
      <span v-if="isFieldVisible('owner')">Owner</span>
      <span v-if="isFieldVisible('updated')">Updated</span>
    </div>

    <div v-if="rows.length">
      <button
        v-for="row in rows"
        :key="row.id"
        type="button"
        class="linear-row grid min-h-12 w-full items-center px-4 py-2 text-left"
        :style="{ gridTemplateColumns: gridTemplate }"
        @click="emit('open', row.viewId)"
      >
        <span class="flex min-w-0 items-center gap-3 pr-4">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
            :style="{ backgroundColor: row.color }"
            aria-hidden="true"
          >
            <Icon :name="`lucide:${row.icon}`" class="h-4 w-4" />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-[13px] font-medium text-[#e6e7ea]">{{
              row.name
            }}</span>
            <span class="mt-0.5 block truncate text-[11px] text-[#777a83]">{{
              row.description
            }}</span>
          </span>
        </span>

        <span v-if="isFieldVisible('type')" class="truncate text-[12px] text-[#aeb0b7]">{{
          row.category
        }}</span>
        <span v-if="isFieldVisible('items')" class="text-[12px] text-[#8f9198]">{{
          row.count
        }}</span>
        <span v-if="isFieldVisible('owner')" class="truncate pr-4 text-[12px] text-[#aeb0b7]">{{
          row.owner
        }}</span>
        <span v-if="isFieldVisible('updated')" class="truncate text-[12px] text-[#777a83]">{{
          getRelativeTimeLabel(row.updatedAt)
        }}</span>
      </button>
    </div>

    <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
      <div class="max-w-sm">
        <p class="text-[13px] font-medium text-[#d7d8dc]">
          No saved views found
        </p>
        <p class="mt-1 text-[12px] text-[#777a83]">
          Create a custom issue or project view to see it here.
        </p>
      </div>
    </div>
  </div>
</template>
