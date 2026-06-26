<script setup lang="ts">
import { useSettingsPageContext } from '@/features/settings/settingsPageContext'

const {
  canSaveJiraConnectionDetails,
  isSavingSpaceSettings,
  jiraApiToken,
  jiraBaseUrlDraft,
  jiraConnectionSummary,
  jiraEmailDraft,
  jiraFeedback,
  saveJiraApiToken,
  saveJiraConnectionDetails,
} = useSettingsPageContext()
</script>

<template>
  <section class="mx-auto max-w-3xl space-y-5">
    <div>
      <h2 class="text-xl font-semibold text-slate-100">
        Workspace
      </h2>
      <p class="mt-1 text-sm text-slate-500">
        Manage Jira connection details.
      </p>
    </div>

    <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <p class="text-sm font-medium text-slate-200">
        Jira connection
      </p>
      <p class="mt-1 text-xs text-slate-500">
        {{ jiraConnectionSummary }}
      </p>
      <p class="mt-2 text-xs text-slate-500">
        Saved Jira credentials live in <code>.data/settings.json</code>. The API token stays hidden after saving.
      </p>
      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-slate-500">Jira URL</span>
          <input
            v-model="jiraBaseUrlDraft"
            type="url"
            name="jira-base-url"
            autocomplete="url"
            placeholder="https://example.atlassian.net"
            class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-white/[0.16] focus:bg-white/[0.06]"
            @keydown.enter.prevent="saveJiraConnectionDetails"
          >
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-slate-500">Atlassian email</span>
          <input
            v-model="jiraEmailDraft"
            type="email"
            name="jira-email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-white/[0.16] focus:bg-white/[0.06]"
            @keydown.enter.prevent="saveJiraConnectionDetails"
          >
        </label>
      </div>
      <div class="mt-3 flex justify-end">
        <button
          type="button"
          class="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/[0.14] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
          :disabled="!canSaveJiraConnectionDetails"
          @click="saveJiraConnectionDetails"
        >
          Save connection
        </button>
      </div>
      <div class="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 md:flex-row md:items-center">
        <div class="w-full space-y-2">
          <input
            v-model="jiraApiToken"
            type="password"
            name="jira-api-token"
            autocomplete="new-password"
            placeholder="Paste a new Jira API token"
            class="w-full rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-white/[0.16] focus:bg-white/[0.06]"
            @keydown.enter.prevent="saveJiraApiToken"
          >
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
            class="inline-flex text-xs text-slate-400 transition hover:text-slate-200"
          >
            Create a Jira API token
          </a>
        </div>
        <button
          type="button"
          class="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/[0.14] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
          :disabled="isSavingSpaceSettings || !jiraApiToken.trim()"
          @click="saveJiraApiToken"
        >
          Update API key
        </button>
      </div>
      <p
        v-if="jiraFeedback"
        class="mt-3 rounded-md px-3 py-2 text-xs"
        :class="jiraFeedback.kind === 'success'
          ? 'border border-white/[0.08] bg-white/[0.035] text-slate-300'
          : 'border border-rose-400/20 bg-rose-500/10 text-rose-200'"
      >
        {{ jiraFeedback.message }}
      </p>
    </div>
  </section>
</template>
