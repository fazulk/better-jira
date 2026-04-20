<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { fetchJiraCurrentUser } from '@/api/jira'
import { jiraCurrentUserQueryKey } from '@/composables/useJiraCurrentUser'
import { useSpaceSettings } from '@/composables/useSpaceSettings'

const props = defineProps<{
  open: boolean
}>()

type JiraSetupStep = 'form' | 'connecting' | 'success'

const queryClient = useQueryClient()
const { aiConnection, jiraConnection, isSaving, updateAiCredentials, updateJiraCredentials } = useSpaceSettings()

const baseUrl = ref('')
const email = ref('')
const apiToken = ref('')
const cerebrasApiKey = ref('')
const errorMessage = ref<string | null>(null)
const connectedDisplayName = ref('')
const setupStep = ref<JiraSetupStep>('form')
const isVisible = ref(props.open)

function resetSetupForm(): void {
  baseUrl.value = jiraConnection.value.baseUrl
  email.value = jiraConnection.value.email
  apiToken.value = ''
  cerebrasApiKey.value = ''
  errorMessage.value = null
  connectedDisplayName.value = ''
  setupStep.value = 'form'
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    isVisible.value = true
    resetSetupForm()
    return
  }

  if (setupStep.value === 'form') {
    isVisible.value = false
  }
}, { immediate: true })

const canSubmit = computed(() => (
  baseUrl.value.trim().length > 0
  && email.value.trim().length > 0
  && apiToken.value.trim().length > 0
  && !isSaving.value
  && setupStep.value === 'form'
))

async function saveCredentials(): Promise<void> {
  if (!canSubmit.value) {
    return
  }

  errorMessage.value = null
  connectedDisplayName.value = ''
  setupStep.value = 'connecting'

  try {
    await updateJiraCredentials({
      baseUrl: baseUrl.value.trim(),
      email: email.value.trim(),
      apiToken: apiToken.value.trim(),
    })

    if (cerebrasApiKey.value.trim()) {
      await updateAiCredentials({
        cerebrasApiKey: cerebrasApiKey.value.trim(),
      })
    }

    const currentUser = await queryClient.fetchQuery({
      queryKey: jiraCurrentUserQueryKey,
      queryFn: fetchJiraCurrentUser,
    })

    connectedDisplayName.value = currentUser.displayName.trim()
    apiToken.value = ''
    cerebrasApiKey.value = ''
    setupStep.value = 'success'
  } catch (error) {
    setupStep.value = 'form'
    isVisible.value = true
    errorMessage.value = error instanceof Error ? error.message : 'Failed to connect to Jira.'
  }
}

async function continueToSettings(): Promise<void> {
  isVisible.value = false
  setupStep.value = 'form'
  errorMessage.value = null
  connectedDisplayName.value = ''
  await navigateTo('/settings')
}
</script>

<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-sm"
  >
    <div class="glass-card animate-slide-up w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-surface-1/95 shadow-2xl shadow-black/40">
      <template v-if="setupStep === 'form'">
        <div class="border-b border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_42%),radial-gradient(circle_at_top_right,rgba(245,166,35,0.14),transparent_38%)] px-7 py-6">
          <p class="text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-300/80">Jira Setup</p>
          <h2 class="mt-3 font-display text-3xl font-semibold tracking-tight text-white">Connect BetterJira to your workspace</h2>
          <p class="mt-3 max-w-lg text-sm leading-6 text-slate-300">
            Jira credentials are now stored locally in <code>.data/settings.json</code>. Enter your Jira site URL, Atlassian email, and API token to unlock remote tickets.
          </p>
          <p class="mt-4 max-w-lg text-xs leading-5 text-slate-400">
            These settings are local only and not tracked. BetterJira runs on your machine.
          </p>
        </div>

        <form class="space-y-5 px-7 py-6" @submit.prevent="saveCredentials">
          <label class="block space-y-2">
            <span class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Jira Base URL</span>
            <input
              v-model="baseUrl"
              type="url"
              autocomplete="url"
              placeholder="https://your-team.atlassian.net"
              class="filter-input w-full rounded-2xl px-4 py-3 text-sm text-slate-100"
            >
          </label>

          <label class="block space-y-2">
            <span class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Atlassian Email</span>
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@company.com"
              class="filter-input w-full rounded-2xl px-4 py-3 text-sm text-slate-100"
            >
          </label>

          <label class="block space-y-2">
            <span class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">API Token</span>
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noreferrer"
              class="inline-flex text-xs text-sky-300 transition hover:text-sky-200"
            >
              Create an Atlassian API token
            </a>
            <input
              v-model="apiToken"
              type="password"
              autocomplete="new-password"
              placeholder="Paste an Atlassian API token"
              class="filter-input w-full rounded-2xl px-4 py-3 text-sm text-slate-100"
            >
          </label>

          <label class="block space-y-2">
            <span class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Cerebras API Key</span>
            <a
              href="https://cloud.cerebras.ai/"
              target="_blank"
              rel="noreferrer"
              class="inline-flex text-xs text-sky-300 transition hover:text-sky-200"
            >
              Open the Cerebras console
            </a>
            <p class="text-xs leading-5 text-slate-400">
              Optional. Add this if you want to use the Cerebras AI provider for description generation.
              <span v-if="aiConnection.hasCerebrasApiKey"> A local Cerebras key is already saved.</span>
            </p>
            <input
              v-model="cerebrasApiKey"
              type="password"
              autocomplete="new-password"
              placeholder="Optional. Leave blank to keep the current local key."
              class="filter-input w-full rounded-2xl px-4 py-3 text-sm text-slate-100"
            >
          </label>

          <p v-if="errorMessage" class="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {{ errorMessage }}
          </p>

          <div class="flex items-center justify-end gap-4 border-t border-white/[0.08] pt-5">
            <button
              type="submit"
              :disabled="!canSubmit"
              class="rounded-2xl border border-sky-400/20 bg-sky-400/15 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            >
              {{ isSaving ? 'Saving…' : 'Connect Jira' }}
            </button>
          </div>
        </form>
      </template>

      <div
        v-else-if="setupStep === 'connecting'"
        class="px-7 py-10"
        aria-live="polite"
      >
        <div class="mb-5 flex items-center justify-center">
          <div class="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-sky-300/20 border-t-sky-300"></div>
            <div class="absolute h-11 w-11 rounded-full border border-sky-300/10"></div>
          </div>
        </div>

        <div class="space-y-3 text-center">
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300/80">
            Jira
          </p>
          <h2 class="font-display text-3xl font-semibold text-white">
            Connecting to Jira
          </h2>
          <p class="mx-auto max-w-sm text-sm leading-6 text-slate-400">
            Saving your credentials and checking the workspace connection before you continue.
          </p>
        </div>
      </div>

      <div
        v-else
        class="px-7 py-10"
        aria-live="polite"
      >
        <div class="mb-5 flex items-center justify-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-200 shadow-lg shadow-emerald-950/30">
            <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div class="space-y-3 text-center">
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
            Connected
          </p>
          <h2 class="font-display text-3xl font-semibold text-white">
            Jira is connected
          </h2>
          <p class="mx-auto max-w-md text-sm leading-6 text-slate-300">
            <span v-if="connectedDisplayName">{{ connectedDisplayName }} is signed in.</span>
            Add the spaces you want BetterJira to load next, then continue into the workspace.
          </p>
          <p class="mx-auto max-w-md text-xs leading-5 text-slate-400">
            Open Settings and enable the spaces you want to see in the sidebar.
          </p>
        </div>

        <div class="mt-8 flex items-center justify-center">
          <button
            type="button"
            class="rounded-2xl border border-emerald-400/25 bg-emerald-400/15 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-400/25"
            @click="continueToSettings"
          >
            Continue to settings
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
