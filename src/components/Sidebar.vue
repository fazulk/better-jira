<script setup lang="ts">
import { computed } from 'vue'
import { getStatusGroup, type JiraTicket } from '@/types/jira'
import { usePinnedTickets } from '@/composables/usePinnedTickets'
import { useSpaceSettings } from '@/composables/useSpaceSettings'

const props = defineProps<{
  tickets: JiraTicket[]
  selectedKey: string | null
  collapsed: boolean
  refreshing: boolean
  currentView: string
}>()

const emit = defineEmits<{
  select: [key: string]
  prefetch: [key: string]
  'toggle-collapse': []
  refresh: []
  home: []
  settings: []
  command: []
  view: [viewId: string]
}>()

const { pinnedKeys } = usePinnedTickets()
const { enabledSpaces } = useSpaceSettings()

interface NavItem {
  id: string
  label: string
  icon: string
  count?: number
}

interface TeamNavItem {
  key: string
  name: string
  activeCount: number
  triageCount: number
}

const enabledSpaceKeys = computed(() => new Set(enabledSpaces.value.map(space => space.key)))
const currentViewId = computed(() => props.currentView)
const viewNavigationIsActive = computed(() => !props.selectedKey)
const visibleTickets = computed(() => props.tickets.filter(ticket => enabledSpaceKeys.value.has(ticket.spaceKey)))
const projectTicketKeySet = computed(() => {
  const keys = new Set<string>()
  for (const ticket of visibleTickets.value) {
    if (isEpicIssue(ticket)) {
      keys.add(ticket.key)
    }
  }
  return keys
})
const issueTickets = computed(() => visibleTickets.value.filter(ticket => !projectTicketKeySet.value.has(ticket.key)))
const activeTickets = computed(() => issueTickets.value.filter(ticket => getStatusGroup(ticket.statusCategory) !== 'done'))
const triageTickets = computed(() => issueTickets.value.filter(ticket => getStatusGroup(ticket.statusCategory) === 'new'))

const primaryItems = computed<NavItem[]>(() => [
  { id: 'inbox', label: 'Inbox', icon: 'inbox', count: triageTickets.value.length },
  { id: 'my-issues', label: 'My issues', icon: 'target', count: activeTickets.value.length },
])

const workspaceItems = computed<NavItem[]>(() => [
  { id: 'initiatives', label: 'Initiatives', icon: 'initiative' },
  { id: 'projects', label: 'Projects', icon: 'project' },
  { id: 'views', label: 'Views', icon: 'view' },
])

const savedViews = computed<NavItem[]>(() => [
  {
    id: 'ready-qa',
    label: 'Ready for QA',
    icon: 'search',
    count: issueTickets.value.filter(ticket => ticket.status.toLowerCase().includes('ready for qa')).length,
  },
])

const ticketByKey = computed(() => new Map(visibleTickets.value.map<readonly [string, JiraTicket]>(ticket => [ticket.key, ticket])))
const pinnedTickets = computed(() => pinnedKeys.value
  .map(key => ticketByKey.value.get(key))
  .filter((ticket): ticket is JiraTicket => ticket !== undefined)
  .slice(0, 6))

const teamItems = computed<TeamNavItem[]>(() => enabledSpaces.value.map(space => {
  const tickets = issueTickets.value.filter(ticket => ticket.spaceKey === space.key)
  const activeCount = tickets.filter(ticket => getStatusGroup(ticket.statusCategory) !== 'done').length
  const triageCount = tickets.filter(ticket => getStatusGroup(ticket.statusCategory) === 'new').length

  return {
    key: space.key,
    name: space.name || space.key,
    activeCount,
    triageCount,
  }
}))

function isEpicIssue(ticket: JiraTicket): boolean {
  return ticket.issueType.toLowerCase().includes('epic')
}

function isActiveView(viewId: string): boolean {
  return viewNavigationIsActive.value && currentViewId.value === viewId
}

function selectView(viewId: string) {
  emit('view', viewId)
}

type TeamViewSection = 'triage' | 'all' | 'active' | 'backlog' | 'projects' | 'views'

function getTeamViewId(spaceKey: string, section: TeamViewSection): string {
  return `team:${spaceKey}:${section}`
}

function isTeamIssuesView(spaceKey: string): boolean {
  return viewNavigationIsActive.value && (
    currentViewId.value === getTeamViewId(spaceKey, 'all')
    || currentViewId.value === getTeamViewId(spaceKey, 'active')
    || currentViewId.value === getTeamViewId(spaceKey, 'backlog')
  )
}
</script>

<template>
  <aside class="flex h-screen w-full flex-col overflow-hidden border-r border-white/[0.06] bg-[#090a0c] text-[13px] text-[#b9bbc3]">
    <div class="flex h-11 shrink-0 items-center gap-2 px-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[#e6e7ea] hover:bg-white/[0.05]"
        :class="collapsed ? 'justify-center' : ''"
        @click="emit('home')"
      >
        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#2f7cf6] text-[11px] font-semibold text-white">B</span>
        <span v-if="!collapsed" class="truncate font-medium">BetterJira!</span>
      </button>

      <button
        v-if="!collapsed"
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8f9198] hover:bg-white/[0.05] hover:text-[#e6e7ea]"
        title="Search workspace"
        @click="emit('command')"
      >
        <span aria-hidden="true">⌕</span>
      </button>

      <button
        v-if="!collapsed"
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8f9198] hover:bg-white/[0.05] hover:text-[#e6e7ea]"
        title="Create issue"
        @click="selectView('create')"
      >
        <span aria-hidden="true">＋</span>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-3">
      <nav class="space-y-5">
        <section class="space-y-0.5">
          <button
            v-for="item in primaryItems"
            :key="item.id"
            type="button"
            class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
            :class="[
              isActiveView(item.id) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#a9abb3] hover:bg-white/[0.045] hover:text-[#e6e7ea]',
              collapsed ? 'justify-center' : '',
            ]"
            @click="selectView(item.id)"
          >
            <span class="w-4 shrink-0 text-center text-[12px] text-[#8f9198]">{{ item.icon === 'inbox' ? '▤' : '◎' }}</span>
            <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ item.label }}</span>
            <span v-if="!collapsed && item.count !== undefined && item.count > 0" class="text-[11px] text-[#6f727b]">{{ item.count }}</span>
          </button>
        </section>

        <section v-if="!collapsed" class="space-y-1">
          <div class="flex h-6 items-center justify-between px-2 text-[12px] font-medium text-[#777a83]">
            <span>Workspace</span>
            <span>⌄</span>
          </div>
          <button
            v-for="item in workspaceItems"
            :key="item.id"
            type="button"
            class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
            :class="isActiveView(item.id) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#a9abb3] hover:bg-white/[0.045] hover:text-[#e6e7ea]'"
            @click="selectView(item.id)"
          >
            <span class="w-4 shrink-0 text-center text-[12px] text-[#8f9198]">{{ item.icon === 'project' ? '◈' : item.icon === 'view' ? '◌' : '◇' }}</span>
            <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
          </button>
        </section>

        <section v-if="!collapsed" class="space-y-1">
          <div class="flex h-6 items-center justify-between px-2 text-[12px] font-medium text-[#777a83]">
            <span>Favorites</span>
            <span>⌄</span>
          </div>
          <button
            v-for="item in savedViews"
            :key="item.id"
            type="button"
            class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
            :class="isActiveView(item.id) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#a9abb3] hover:bg-white/[0.045] hover:text-[#e6e7ea]'"
            @click="selectView(item.id)"
          >
            <span class="w-4 shrink-0 text-center text-[12px] text-[#bfc1c8]">●</span>
            <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
            <span v-if="item.count !== undefined && item.count > 0" class="text-[11px] text-[#6f727b]">{{ item.count }}</span>
          </button>

          <button
            v-for="ticket in pinnedTickets"
            :key="ticket.key"
            type="button"
            class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
            :class="selectedKey === ticket.key ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#a9abb3] hover:bg-white/[0.045] hover:text-[#e6e7ea]'"
            @mouseenter="emit('prefetch', ticket.key)"
            @click="emit('select', ticket.key)"
          >
            <span class="w-4 shrink-0 text-center text-[12px] text-[#d7a543]">◆</span>
            <span class="min-w-0 flex-1 truncate">{{ ticket.key }} {{ ticket.summary }}</span>
          </button>
        </section>

        <section v-if="!collapsed" class="space-y-1">
          <div class="flex h-6 items-center justify-between px-2 text-[12px] font-medium text-[#777a83]">
            <span>Your teams</span>
            <span>＋</span>
          </div>

          <div v-for="team in teamItems" :key="team.key" class="space-y-0.5">
            <button
              type="button"
              class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-[#c6c8ce] transition hover:bg-white/[0.045] hover:text-[#f0f1f4]"
              :class="viewNavigationIsActive && currentViewId.startsWith(`team:${team.key}:`) ? 'bg-white/[0.055]' : ''"
              @click="selectView(getTeamViewId(team.key, 'active'))"
            >
              <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-[#d65d5d] text-[9px] text-white">{{ team.key.slice(0, 1) }}</span>
              <span class="min-w-0 flex-1 truncate">{{ team.name }}</span>
              <span v-if="team.activeCount > 0" class="text-[11px] text-[#6f727b]">{{ team.activeCount }}</span>
            </button>

            <div v-if="currentViewId.startsWith(`team:${team.key}:`)" class="ml-5 space-y-0.5">
              <button
                type="button"
                class="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition"
                :class="isActiveView(getTeamViewId(team.key, 'triage')) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="selectView(getTeamViewId(team.key, 'triage'))"
              >
                <span class="w-3 text-center">○</span>
                <span class="flex-1 truncate">Triage</span>
                <span v-if="team.triageCount > 0">{{ team.triageCount }}</span>
              </button>
              <button
                type="button"
                class="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition"
                :class="isTeamIssuesView(team.key) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="selectView(getTeamViewId(team.key, 'active'))"
              >
                <span class="w-3 text-center">◌</span>
                <span class="flex-1 truncate">Issues</span>
              </button>
              <button
                type="button"
                class="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition"
                :class="isActiveView(getTeamViewId(team.key, 'projects')) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="selectView(getTeamViewId(team.key, 'projects'))"
              >
                <span class="w-3 text-center">◈</span>
                <span class="flex-1 truncate">Projects</span>
              </button>
              <button
                type="button"
                class="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition"
                :class="isActiveView(getTeamViewId(team.key, 'views')) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="selectView(getTeamViewId(team.key, 'views'))"
              >
                <span class="w-3 text-center">◍</span>
                <span class="flex-1 truncate">Views</span>
              </button>
            </div>
          </div>
        </section>
      </nav>
    </div>

    <div class="shrink-0 space-y-1 border-t border-white/[0.06] px-2 py-2">
      <button
        type="button"
        class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-[#8f9198] transition hover:bg-white/[0.045] hover:text-[#e6e7ea]"
        :class="collapsed ? 'justify-center' : ''"
        :disabled="refreshing"
        @click="emit('refresh')"
      >
        <span class="w-4 text-center" :class="{ 'animate-spin': refreshing }">↻</span>
        <span v-if="!collapsed" class="flex-1 truncate">{{ refreshing ? 'Syncing' : 'Sync Jira' }}</span>
      </button>
      <button
        type="button"
        class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-[#8f9198] transition hover:bg-white/[0.045] hover:text-[#e6e7ea]"
        :class="collapsed ? 'justify-center' : ''"
        @click="emit('settings')"
      >
        <span class="w-4 text-center">⚙</span>
        <span v-if="!collapsed" class="flex-1 truncate">Settings</span>
      </button>
      <button
        type="button"
        class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-[#8f9198] transition hover:bg-white/[0.045] hover:text-[#e6e7ea]"
        :class="collapsed ? 'justify-center' : ''"
        @click="emit('toggle-collapse')"
      >
        <span class="w-4 text-center">{{ collapsed ? '›' : '‹' }}</span>
        <span v-if="!collapsed" class="flex-1 truncate">Collapse sidebar</span>
      </button>
    </div>
  </aside>
</template>
