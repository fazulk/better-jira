<script setup lang="ts">
import { computed } from 'vue'
import { useLabelColors } from '@/composables/useLabelColors'

const props = withDefaults(defineProps<{
  label: string
  dense?: boolean
  showDot?: boolean
}>(), {
  dense: false,
  showDot: true,
})

const { getLabelColor, openLabelColorMenu } = useLabelColors()

const labelColor = computed(() => getLabelColor(props.label))
const dotStyle = computed(() => ({
  backgroundColor: labelColor.value,
}))
const sizeClass = computed(() => props.dense ? 'px-2 py-1 text-[11px]' : 'px-2 py-1.5 text-xs')

function handleContextMenu(event: MouseEvent): void {
  openLabelColorMenu(props.label, event)
}
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.025] font-medium leading-[1.25] text-slate-300 transition hover:bg-white/[0.04]"
    :class="sizeClass"
    title="Right-click to change label color"
    @contextmenu="handleContextMenu"
  >
    <span v-if="showDot" class="h-2 w-2 shrink-0 rounded-full" :style="dotStyle"></span>
    <span class="truncate">{{ label }}</span>
  </span>
</template>
