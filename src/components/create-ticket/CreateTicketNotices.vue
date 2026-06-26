<script setup lang="ts">
defineProps<{
  attachmentNotice: string | null
  submitError: string | null
}>()
</script>

<template>
  <div v-if="submitError" class="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
    {{ submitError }}
  </div>
  <div v-if="attachmentNotice" class="rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-xs text-slate-500">
    {{ attachmentNotice }}
  </div>
</template>
