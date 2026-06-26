<script setup lang="ts">
import { useSettingsPageContext } from '@/features/settings/settingsPageContext'

const {
  allInstructionPresets,
  canAddPreset,
  canSaveEditedPreset,
  cancelEditing,
  editingPreset,
  editingPresetId,
  newPreset,
  removeLocalPreset,
  saveEditedPreset,
  saveNewPreset,
  startEditing,
  togglePresetEnabled,
} = useSettingsPageContext()
</script>

<template>
  <section class="mx-auto max-w-3xl space-y-5">
    <div>
      <h2 class="text-xl font-semibold text-slate-100">
        AI instructions
      </h2>
      <p class="mt-1 text-sm text-slate-500">
        Manage the prompt chips shown in the AI description assistant.
      </p>
    </div>

    <div class="space-y-3">
      <div
        v-for="preset in allInstructionPresets"
        :key="preset.id"
        class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4"
      >
        <div v-if="editingPresetId === preset.id" class="space-y-3">
          <input
            v-model="editingPreset.label"
            type="text"
            name="editing-preset-label"
            placeholder="Instruction label"
            class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
          >
          <textarea
            v-model="editingPreset.text"
            name="editing-preset-text"
            rows="4"
            placeholder="Instruction text"
            class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
          />
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
              @click="cancelEditing"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-md bg-accent-indigo px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="!canSaveEditedPreset"
              @click="saveEditedPreset"
            >
              Save
            </button>
          </div>
        </div>

        <div v-else class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-slate-200">
              {{ preset.label }}
            </p>
            <p class="mt-1 text-xs leading-relaxed text-slate-500">
              {{ preset.text }}
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="relative h-6 w-11 rounded-full transition-colors duration-200"
              :class="preset.enabled ? 'bg-accent-indigo' : 'bg-white/[0.08]'"
              role="switch"
              :aria-checked="preset.enabled"
              @click="togglePresetEnabled(preset.id)"
            >
              <span
                class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                :class="preset.enabled ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
                @click="startEditing(preset.id)"
              >
                Edit
              </button>
              <button
                type="button"
                class="rounded-md border border-rose-500/20 px-3 py-1.5 text-xs text-rose-300 transition hover:border-rose-500/40 hover:text-rose-200"
                @click="removeLocalPreset(preset.id)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] p-4">
      <h3 class="text-sm font-medium text-slate-200">
        Add instruction
      </h3>
      <div class="mt-3 space-y-3">
        <input
          v-model="newPreset.label"
          type="text"
          name="new-preset-label"
          placeholder="Instruction label"
          class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
        >
        <textarea
          v-model="newPreset.text"
          name="new-preset-text"
          rows="4"
          placeholder="Instruction text"
          class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
        />
        <div class="flex justify-end">
          <button
            type="button"
            class="rounded-md bg-accent-indigo px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!canAddPreset"
            @click="saveNewPreset"
          >
            Add instruction
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
