<script setup lang="ts">
withDefaults(defineProps<{
  copiedDescription: boolean
  showCopy: boolean
  showAi?: boolean
}>(), {
  showAi: true,
})

defineEmits<{
  copy: []
  ai: []
  edit: []
}>()
</script>

<template>
  <div class="flex items-center gap-1.5">
    <button
      v-if="showCopy"
      class="relative group/copy-desc shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
      @click="$emit('copy')"
    >
      <svg v-if="!copiedDescription" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      <svg v-else class="h-3 w-3 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span
        class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 transition-opacity"
        :class="copiedDescription ? 'opacity-100' : 'group-hover/copy-desc:opacity-100'"
      >
        {{ copiedDescription ? 'Copied!' : 'Copy description' }}
      </span>
    </button>

    <button
      v-if="showAi"
      class="relative group/ai-desc shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md border border-violet-500/20 text-violet-400/70 transition hover:bg-violet-500/10 hover:text-violet-300 hover:border-violet-500/30"
      @click="$emit('ai')"
    >
      <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z"/>
      </svg>
      <span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 transition-opacity group-hover/ai-desc:opacity-100">
        AI enhance
      </span>
    </button>

    <button
      class="relative group/edit-desc shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
      @click="$emit('edit')"
    >
      <svg class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
      <span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 transition-opacity group-hover/edit-desc:opacity-100">
        Edit description
      </span>
    </button>
  </div>
</template>
