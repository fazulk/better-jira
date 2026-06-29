<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string | null
  iconColor?: string | null
  fallback?: string | null
}>(), {
  icon: null,
  iconColor: null,
  fallback: null,
})
</script>

<template>
  <span class="flex min-w-0 items-center gap-1.5 text-[14px] font-normal text-[#f0f1f4]">
    <span
      v-if="icon || fallback"
      class="flex h-4.5 w-4.5 shrink-0 items-center justify-center text-[13px] font-normal"
      :style="iconColor ? { color: iconColor } : undefined"
    >
      <Icon v-if="icon" :name="`lucide:${icon}`" class="h-4.5 w-4.5" aria-hidden="true" />
      <template v-else>{{ fallback }}</template>
    </span>
    <slot />
  </span>
</template>
