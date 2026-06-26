<script setup lang="ts">
import { ref } from 'vue'

interface SpaceOption {
  key: string
  name: string
}

defineProps<{
  effectiveSpaceKey: string | null
  isCreatePending: boolean
  isSpaceLocked: boolean
  selectedSpaceName: string
  spaces: SpaceOption[]
}>()

const emit = defineEmits<{
  'update:spaceKey': [spaceKey: string | null]
}>()

const spaceSelectRef = ref<HTMLSelectElement | null>(null)

function getSelectValue(event: Event): string {
  const target = event.target
  return target instanceof HTMLSelectElement ? target.value : ''
}

function focus(): void {
  spaceSelectRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="space-y-1.5">
    <label for="create-space" class="text-[11px] uppercase tracking-[0.14em] text-slate-500">Team</label>
    <select
      id="create-space"
      ref="spaceSelectRef"
      name="create-space"
      :value="effectiveSpaceKey ?? ''"
      class="w-full rounded-md border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-white/[0.16] disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="isCreatePending || isSpaceLocked || spaces.length === 0"
      @change="emit('update:spaceKey', getSelectValue($event) || null)"
    >
      <option value="" disabled>
        {{ spaces.length === 0 ? 'No enabled spaces available' : 'Choose a space' }}
      </option>
      <option
        v-for="space in spaces"
        :key="space.key"
        :value="space.key"
      >
        {{ space.name }} ({{ space.key }})
      </option>
    </select>
    <p v-if="isSpaceLocked" class="text-xs text-slate-500">
      Fixed by parent: {{ selectedSpaceName }}.
    </p>
    <p v-else-if="spaces.length === 0" class="text-xs text-amber-200">
      Enable at least one space in settings before creating a top-level issue.
    </p>
  </div>
</template>
