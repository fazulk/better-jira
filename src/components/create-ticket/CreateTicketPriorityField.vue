<script setup lang="ts">
import { ref } from 'vue'
import { priorityConfig } from '@/features/create-ticket/constants'
import type { CreateFieldOption } from '@/features/create-ticket/types'

defineProps<{
  fieldError: string | null
  isCreatePending: boolean
  isFieldLoading: boolean
  options: CreateFieldOption[]
  priorityName: string
  priorityValue: string
}>()

const emit = defineEmits<{
  'update:priority': [value: string]
}>()

const prioritySelectRef = ref<HTMLSelectElement | null>(null)

function getSelectValue(event: Event): string {
  const target = event.target
  return target instanceof HTMLSelectElement ? target.value : ''
}

function focus(): void {
  prioritySelectRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="space-y-2">
    <label for="create-field-priority" class="flex items-center gap-2 text-sm font-medium text-slate-200">
      <span>Priority</span>
    </label>
    <div class="group relative flex items-center gap-1.5">
      <div class="flex items-center gap-2">
        <select
          id="create-field-priority"
          ref="prioritySelectRef"
          name="create-priority"
          :value="priorityValue"
          class="rounded-md border border-white/[0.08] bg-surface-0 px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-white/[0.16]"
          :disabled="isCreatePending || isFieldLoading"
          @change="emit('update:priority', getSelectValue($event))"
        >
          <option
            v-for="option in options"
            :key="`priority-${option.value || 'empty'}`"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <div class="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="priorityConfig[priorityName]?.bg || 'bg-slate-500'"
          ></span>
          <span class="text-[11px] font-medium text-slate-400">{{ priorityName }}</span>
        </div>
      </div>
    </div>
    <p v-if="isFieldLoading" class="text-xs text-slate-500">
      Loading priority options...
    </p>
    <p v-else-if="fieldError" class="text-xs text-rose-300">
      {{ fieldError }}
    </p>
  </div>
</template>
