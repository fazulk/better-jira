<script setup lang="ts">
defineProps<{
  count: number
  canCreateChild: boolean
}>()

const emit = defineEmits<{
  open: []
  copy: []
  createChild: []
  clear: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="count > 0"
        class="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
        aria-live="polite"
      >
        <div
          class="flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-2/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur"
        >
          <div
            class="flex items-center gap-2 border-r border-white/[0.08] px-2.5 text-[12px] text-[#d7d8dc]"
          >
            <span
              class="flex h-5 min-w-5 items-center justify-center rounded border border-white/[0.08] bg-white/[0.045] px-1.5 text-[11px] font-semibold text-slate-200"
            >{{ count }}</span>
            <span class="whitespace-nowrap">{{
              count === 1 ? 'issue selected' : 'issues selected'
            }}</span>
          </div>

          <button
            type="button"
            class="h-7 rounded-md px-2.5 text-[12px] text-[#bfc1c8] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
            @click="emit('open')"
          >
            Open
          </button>
          <button
            type="button"
            class="h-7 rounded-md px-2.5 text-[12px] text-[#bfc1c8] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
            @click="emit('copy')"
          >
            Copy IDs
          </button>
          <button
            v-if="canCreateChild"
            type="button"
            class="h-7 rounded-md px-2.5 text-[12px] text-[#bfc1c8] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
            @click="emit('createChild')"
          >
            Add sub-issue
          </button>
          <button
            type="button"
            class="h-7 rounded-md px-2.5 text-[12px] text-[#8f9198] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
            @click="emit('clear')"
          >
            Clear
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
