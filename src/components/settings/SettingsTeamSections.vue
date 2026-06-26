<script setup lang="ts">
import { useSettingsPageContext } from '@/features/settings/settingsPageContext'

const {
  activeSettingsSection,
  constrainedSettingsRows,
  constrainedSettingsSectionDescription,
  constrainedSettingsSectionTitle,
  statusGroupLabels,
  teamMemberRows,
  teamSettingsRows,
  teamStatusRows,
} = useSettingsPageContext()
</script>

<template>
  <section v-show="activeSettingsSection === 'team-overview'" class="mx-auto max-w-3xl space-y-5">
    <div>
      <h2 class="text-xl font-semibold text-slate-100">Teams</h2>
      <p class="mt-1 text-sm text-slate-500">Enabled spaces organized as workspace teams.</p>
    </div>

    <div class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <div
        v-for="team in teamSettingsRows"
        :key="team.value"
        class="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_7rem_10rem]"
      >
        <p class="truncate text-sm font-medium text-slate-200">{{ team.label }}</p>
        <p class="text-sm text-slate-500">{{ team.value }}</p>
        <p class="text-sm text-slate-500">{{ team.detail }}</p>
      </div>
      <p v-if="!teamSettingsRows.length" class="px-4 py-6 text-sm text-slate-500">No enabled Jira spaces.</p>
    </div>
  </section>

  <section v-show="activeSettingsSection === 'team-members'" class="mx-auto max-w-3xl space-y-5">
    <div>
      <h2 class="text-xl font-semibold text-slate-100">Team members</h2>
      <p class="mt-1 text-sm text-slate-500">Membership is inferred from Jira issue assignees and enabled spaces.</p>
    </div>

    <div class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <div
        v-for="team in teamMemberRows"
        :key="team.teamKey"
        class="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_7rem_8rem]"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-slate-200">{{ team.teamName }}</p>
          <p class="mt-0.5 truncate text-xs text-slate-500">{{ team.topMembers }}</p>
        </div>
        <p class="text-sm text-slate-500">{{ team.memberCount }} {{ team.memberCount === 1 ? 'member' : 'members' }}</p>
        <p class="text-right text-sm text-slate-500">{{ team.issueCount }} {{ team.issueCount === 1 ? 'issue' : 'issues' }}</p>
      </div>
      <p v-if="!teamMemberRows.length" class="px-4 py-6 text-sm text-slate-500">No enabled Jira spaces.</p>
    </div>
  </section>

  <section v-show="activeSettingsSection === 'team-statuses'" class="mx-auto max-w-3xl space-y-5">
    <div>
      <h2 class="text-xl font-semibold text-slate-100">Issue statuses</h2>
      <p class="mt-1 text-sm text-slate-500">Statuses currently loaded from enabled Jira spaces.</p>
    </div>

    <div class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <div
        v-for="statusRow in teamStatusRows"
        :key="`${statusRow.group}-${statusRow.status}`"
        class="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)_7rem]"
      >
        <p class="truncate text-sm font-medium text-slate-200">{{ statusRow.status }}</p>
        <p class="text-sm text-slate-500">
          {{ statusGroupLabels[statusRow.group] }} · {{ statusRow.spaces || 'No space' }}
        </p>
        <p class="text-right text-xs text-slate-600">
          {{ statusRow.issueCount }} {{ statusRow.issueCount === 1 ? 'issue' : 'issues' }}
        </p>
      </div>
      <p v-if="!teamStatusRows.length" class="px-4 py-6 text-sm text-slate-500">
        No issue statuses loaded yet.
      </p>
    </div>
  </section>

  <section v-show="activeSettingsSection === 'team-workflows' || activeSettingsSection === 'team-triage' || activeSettingsSection === 'team-cycles' || activeSettingsSection === 'team-ai' || activeSettingsSection === 'danger'" class="mx-auto max-w-3xl space-y-5">
    <div>
      <h2 class="text-xl font-semibold text-slate-100">{{ constrainedSettingsSectionTitle }}</h2>
      <p class="mt-1 text-sm text-slate-500">{{ constrainedSettingsSectionDescription }}</p>
    </div>

    <div class="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <div
        v-for="row in constrainedSettingsRows"
        :key="row.label"
        class="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_10rem]"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-slate-200">{{ row.label }}</p>
          <p class="mt-0.5 text-xs leading-5 text-slate-500">{{ row.detail }}</p>
        </div>
        <p class="text-left text-sm text-slate-400 md:text-right">{{ row.value }}</p>
      </div>
    </div>
  </section>
</template>
