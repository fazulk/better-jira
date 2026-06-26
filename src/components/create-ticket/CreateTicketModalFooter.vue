<script setup lang="ts">
defineProps<{
  canSubmit: boolean
  createMore: boolean
  isCreatePending: boolean
  isLocalSpace: boolean
}>()

const emit = defineEmits<{
  attachment: []
  close: []
  submit: []
  'update:createMore': [value: boolean]
}>()

function getCheckedValue(event: Event): boolean {
  const target = event.target
  return target instanceof HTMLInputElement ? target.checked : false
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-slate-500 transition hover:border-white/[0.14] hover:bg-white/[0.04] hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="isCreatePending"
        aria-label="Add attachment"
        @click="emit('attachment')"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49" />
        </svg>
      </button>
      <label class="inline-flex h-7 items-center gap-2 rounded-md px-2 text-[12px] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300">
        <input
          :checked="createMore"
          type="checkbox"
          class="h-3.5 w-3.5 rounded border-white/[0.14] bg-white/[0.04] accent-[#5e6ad2]"
          :disabled="isCreatePending"
          @change="emit('update:createMore', getCheckedValue($event))"
        >
        <span>Create more</span>
      </label>
    </div>
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="rounded-md border border-white/[0.08] px-3 py-1.5 text-sm text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
        :disabled="isCreatePending"
        @click="emit('close')"
      >
        Cancel
      </button>
      <button
        type="button"
        class="rounded-md bg-accent-indigo px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="!canSubmit"
        @click="emit('submit')"
      >
        {{ isCreatePending ? 'Creating...' : (isLocalSpace ? 'Create local issue' : 'Create issue') }}
      </button>
    </div>
  </div>
</template>
