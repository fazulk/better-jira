<script setup lang="ts">
import type { CreateFieldOption, HardcodedCreateFieldDefinition, HardcodedCreateFieldKey } from '@/features/create-ticket/types'

defineProps<{
  fields: HardcodedCreateFieldDefinition[]
  getCreateFieldError: (fieldKey: HardcodedCreateFieldKey) => string | null
  getCreateFieldOptions: (fieldKey: HardcodedCreateFieldKey) => CreateFieldOption[]
  getInputValue: (event: Event) => string
  getTextValue: (key: string) => string
  isCreateFieldLoading: (fieldKey: HardcodedCreateFieldKey) => boolean
  isCreatePending: boolean
  updateFieldValue: (key: string, value: string) => void
}>()
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="field in fields"
      :key="field.key"
      class="space-y-1.5"
    >
      <label
        v-if="field.key !== 'summary' && field.key !== 'description'"
        :for="`create-field-${field.key}`"
        class="flex items-center gap-2 text-sm font-medium text-slate-200"
      >
        <span>{{ field.label }}</span>
        <span v-if="field.required" class="text-xs uppercase tracking-[0.12em] text-rose-300">Required</span>
      </label>

      <input
        v-if="field.type === 'text'"
        :id="`create-field-${field.key}`"
        :name="`create-${field.key}`"
        aria-label="Issue title"
        :value="getTextValue(field.key)"
        type="text"
        class="w-full rounded-md border border-transparent bg-transparent px-1 py-1.5 text-xl font-medium text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-white/[0.08] focus:bg-white/[0.02]"
        placeholder="Issue title"
        :disabled="isCreatePending"
        @input="updateFieldValue(field.key, getInputValue($event))"
      />

      <textarea
        v-else-if="field.type === 'textarea'"
        :id="`create-field-${field.key}`"
        :name="`create-${field.key}`"
        aria-label="Issue description"
        :value="getTextValue(field.key)"
        rows="4"
        class="w-full resize-y rounded-md border border-transparent bg-transparent px-1 py-1.5 text-sm leading-6 text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-white/[0.08] focus:bg-white/[0.02]"
        placeholder="Add description..."
        :disabled="isCreatePending"
        @input="updateFieldValue(field.key, getInputValue($event))"
      />

      <input
        v-else-if="field.type === 'date'"
        :id="`create-field-${field.key}`"
        :value="getTextValue(field.key)"
        type="date"
        class="w-full rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16]"
        :disabled="isCreatePending"
        @input="updateFieldValue(field.key, getInputValue($event))"
      />

      <select
        v-else
        :id="`create-field-${field.key}`"
        :value="getTextValue(field.key)"
        class="w-full rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16]"
        :disabled="isCreatePending || isCreateFieldLoading(field.key)"
        @change="updateFieldValue(field.key, getInputValue($event))"
      >
        <option
          v-for="option in getCreateFieldOptions(field.key)"
          :key="`${field.key}-${option.value || 'empty'}`"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>

      <p v-if="isCreateFieldLoading(field.key)" class="text-xs text-slate-500">
        Loading {{ field.label.toLowerCase() }} options...
      </p>
      <p v-else-if="getCreateFieldError(field.key)" class="text-xs text-rose-300">
        {{ getCreateFieldError(field.key) }}
      </p>
    </div>
  </div>
</template>
