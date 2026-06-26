<script setup lang="ts">
import { useSettingsPageContext } from '@/features/settings/settingsPageContext'

const {
  aiConnection,
  aiFeedback,
  aiSettings,
  availableModels,
  cerebrasApiKey,
  getProviderLabel,
  getProviderStatusClass,
  handleModelChange,
  handleProviderChange,
  isLoadingProviders,
  isSavingSpaceSettings,
  providerAvailability,
  providerAvailabilityError,
  providers,
  saveCerebrasApiKey,
} = useSettingsPageContext()
</script>

<template>
  <section class="mx-auto max-w-3xl space-y-5">
    <div>
      <h2 class="text-xl font-semibold text-slate-100">
        AI provider
      </h2>
      <p class="mt-1 text-sm text-slate-500">
        Choose the model used by the AI description assistant.
      </p>
    </div>

    <div class="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <div class="grid gap-0 divide-y divide-white/[0.06] md:grid-cols-2 md:divide-x md:divide-y-0">
        <label class="block p-4">
          <span class="mb-2 block text-xs font-medium text-slate-500">Provider</span>
          <select
            :value="aiSettings.provider"
            name="ai-provider"
            class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
            @change="handleProviderChange"
          >
            <option v-for="provider in providers" :key="provider" :value="provider">
              {{ getProviderLabel(provider) }}
            </option>
          </select>
        </label>

        <label class="block p-4">
          <span class="mb-2 block text-xs font-medium text-slate-500">Model</span>
          <select
            :value="aiSettings.model"
            name="ai-model"
            class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
            @change="handleModelChange"
          >
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ model.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-medium text-slate-200">
            Provider availability
          </h3>
          <p class="mt-0.5 text-xs text-slate-500">
            Local CLI detection for AI enhancement.
          </p>
        </div>
        <span v-if="isLoadingProviders" class="text-xs text-slate-500">Checking...</span>
      </div>
      <div class="grid gap-2 md:grid-cols-2">
        <div
          v-for="providerStatus in providerAvailability"
          :key="providerStatus.provider"
          class="rounded-md border px-3 py-2 text-xs"
          :class="getProviderStatusClass(providerStatus)"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="font-medium text-slate-200">{{ getProviderLabel(providerStatus.provider) }}</span>
            <span class="text-[10px] uppercase tracking-[0.16em]">{{ providerStatus.available ? 'Available' : 'Unavailable' }}</span>
          </div>
          <p class="mt-1 text-[11px] leading-relaxed opacity-80">
            {{ providerStatus.detail }}
          </p>
        </div>
      </div>
      <p v-if="providerAvailabilityError" class="mt-3 text-xs text-rose-300">
        Unable to refresh local AI provider detection.
      </p>
    </div>

    <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <p class="text-sm font-medium text-slate-200">
        Local Cerebras key
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Optional. Store a local Cerebras API key in <code>.data/settings.json</code> for the Cerebras provider.
        <span v-if="aiConnection.hasCerebrasApiKey"> A key is already saved.</span>
      </p>
      <div class="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          v-model="cerebrasApiKey"
          type="password"
          name="cerebras-api-key"
          autocomplete="new-password"
          placeholder="Paste a new Cerebras API key"
          class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
        >
        <button
          class="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/[0.14] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
          :disabled="isSavingSpaceSettings || !cerebrasApiKey.trim()"
          @click="saveCerebrasApiKey"
        >
          Save key
        </button>
      </div>
      <p
        v-if="aiFeedback"
        class="mt-3 rounded-md px-3 py-2 text-xs"
        :class="aiFeedback.kind === 'success'
          ? 'border border-white/[0.08] bg-white/[0.035] text-slate-300'
          : 'border border-rose-400/20 bg-rose-500/10 text-rose-200'"
      >
        {{ aiFeedback.message }}
      </p>
    </div>
  </section>
</template>
