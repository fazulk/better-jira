<script setup lang="ts">
const props = defineProps<{
  name: string
  description: string
  saveDisabled?: boolean
}>()

const emit = defineEmits<{
  'update:name': [value: string]
  'update:description': [value: string]
  'open-filters': []
  'open-settings': []
  'save': []
  'cancel': []
}>()

function updateName(event: Event): void {
  if (event.target instanceof HTMLInputElement) {
    emit('update:name', event.target.value)
  }
}

function updateDescription(event: Event): void {
  if (event.target instanceof HTMLInputElement) {
    emit('update:description', event.target.value)
  }
}
</script>

<template>
  <div class="mx-1.5 mb-1.5 shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.035]">
    <div class="flex min-h-[6.25rem] items-start justify-between gap-4 px-3 py-3">
      <div class="flex min-w-0 flex-1 items-start gap-3">
        <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-[#aeb0b7]">
          <Icon name="lucide:layers" class="h-4 w-4" aria-hidden="true" />
        </div>

        <div class="min-w-0 flex-1 space-y-2">
          <input
            :value="props.name"
            type="text"
            class="h-7 w-full bg-transparent text-[15px] font-medium text-[#f0f1f4] outline-none placeholder:text-[#71737c]"
            placeholder="All issues"
            @input="updateName"
          >
          <input
            :value="props.description"
            type="text"
            class="h-6 w-full bg-transparent text-[13px] text-[#aeb0b7] outline-none placeholder:text-[#5f626b]"
            placeholder="Description (optional)"
            @input="updateDescription"
          >
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[12px] text-[#d7d8dc] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[12px] text-[#f0f1f4] hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="props.saveDisabled"
          @click="emit('save')"
        >
          Save
        </button>
      </div>
    </div>

    <div class="flex min-h-12 items-center justify-end gap-2 border-t border-white/[0.06] px-3 py-2">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.045] text-[#8f9198] hover:bg-white/[0.08] hover:text-[#f0f1f4]"
        title="Filter"
        @click="emit('open-filters')"
      >
        <Icon name="lucide:list-filter" class="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.045] text-[#8f9198] hover:bg-white/[0.08] hover:text-[#f0f1f4]"
        title="Settings"
        @click="emit('open-settings')"
      >
        <Icon name="lucide:sliders-horizontal" class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
