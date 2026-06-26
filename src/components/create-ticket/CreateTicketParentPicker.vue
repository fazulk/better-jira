<script setup lang="ts">
import { computed } from 'vue'
import type { JiraTicket } from '@/types/jira'
import { useParentPicker } from '@/features/create-ticket/useParentPicker'

const props = defineProps<{
  effectiveParentKey: string | null
  filteredLabel: string | null
  isCreatePending: boolean
  parentLocked: boolean
  selectedParentIsProject: boolean
  supportedParentDisplayLabel: string | null
  supportedParentTickets: JiraTicket[]
  supportedParentType: string | null
}>()

const emit = defineEmits<{
  'update:parentKey': [key: string | null]
}>()

const parentKey = computed({
  get: () => props.effectiveParentKey,
  set: (key: string | null) => emit('update:parentKey', key),
})
const effectiveParentKey = computed(() => props.effectiveParentKey)
const isCreatePending = computed(() => props.isCreatePending)
const parentLocked = computed(() => props.parentLocked)
const selectedParentIsProject = computed(() => props.selectedParentIsProject)
const supportedParentDisplayLabel = computed(() => props.supportedParentDisplayLabel)
const supportedParentTickets = computed(() => props.supportedParentTickets)
const supportedParentType = computed(() => props.supportedParentType)

const {
  filteredParentOptions,
  getSelectedParentLabel,
  getSupportedParentArticleLabel,
  getSupportedParentTypeLabel,
  handleParentKeydown,
  isEditingParent,
  parentComboRef,
  parentHighlightIndex,
  parentInputRef,
  parentSearch,
  selectParentOption,
  startEditingParent,
  stopEditingParent,
} = useParentPicker({
  effectiveParentKey,
  isCreatePending,
  parentKey,
  parentLocked,
  selectedParentIsProject,
  supportedParentDisplayLabel,
  supportedParentTickets,
  supportedParentType,
})

defineExpose({
  startEditingParent,
  stopEditingParent,
})
</script>

<template>
  <div v-if="supportedParentType" class="space-y-1.5">
    <label class="text-[11px] uppercase tracking-[0.14em] text-slate-500">{{ filteredLabel }}</label>
    <div
      ref="parentComboRef"
      class="relative rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 transition"
      :class="[
        isEditingParent ? 'border-white/[0.14] bg-white/[0.035]' : 'hover:border-white/[0.12]',
        parentLocked
          ? 'cursor-not-allowed border-white/[0.04] bg-white/[0.015] text-slate-500 opacity-60'
          : '',
        isCreatePending ? 'opacity-70' : '',
      ]"
    >
      <div v-if="isEditingParent" class="space-y-2">
        <div class="relative">
          <svg class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref="parentInputRef"
            v-model="parentSearch"
            name="create-parent-search"
            :aria-label="`Search ${getSupportedParentTypeLabel()}s`"
            class="w-full rounded-md border border-white/[0.08] bg-surface-0 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-white/[0.16]"
            :placeholder="`Search ${getSupportedParentTypeLabel()}s...`"
            @keydown="handleParentKeydown"
          />
        </div>
        <div class="max-h-56 overflow-y-auto rounded-lg border border-white/[0.08] bg-surface-0 py-1 shadow-xl shadow-black/30">
          <button
            type="button"
            data-parent-idx="0"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
            :class="parentHighlightIndex === 0 ? 'bg-white/[0.06] text-white' : 'text-slate-300 hover:bg-white/[0.04]'"
            @click="selectParentOption(null)"
            @mouseenter="parentHighlightIndex = 0"
          >
            No parent
          </button>
          <button
            v-for="(ticket, index) in filteredParentOptions"
            :key="ticket.key"
            type="button"
            :data-parent-idx="index + 1"
            class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
            :class="parentHighlightIndex === index + 1 ? 'bg-white/[0.06] text-white' : 'text-slate-300 hover:bg-white/[0.04]'"
            @click="selectParentOption(ticket.key)"
            @mouseenter="parentHighlightIndex = index + 1"
          >
            <span class="mt-0.5 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-500">{{ ticket.key }}</span>
            <span class="min-w-0 text-xs leading-5">{{ ticket.summary }}</span>
          </button>
          <div v-if="filteredParentOptions.length === 0" class="px-3 py-2 text-xs italic text-slate-600">
            No matching {{ getSupportedParentTypeLabel() }}s
          </div>
        </div>
      </div>
      <button
        v-else
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        :disabled="parentLocked || isCreatePending"
        @click="startEditingParent"
      >
        <div class="min-w-0">
          <div class="truncate text-sm text-slate-200">{{ getSelectedParentLabel() }}</div>
          <div class="text-xs text-slate-500">
            {{ effectiveParentKey ? `Change ${getSupportedParentTypeLabel()}` : `Choose ${getSupportedParentArticleLabel()} or leave empty` }}
          </div>
        </div>
        <svg class="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
    <p v-if="parentLocked && effectiveParentKey" class="text-xs text-slate-500">
      Parent is fixed for this create flow.
    </p>
  </div>
</template>
