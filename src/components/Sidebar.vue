<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getStatusGroup, type JiraTicket } from '@/types/jira'
import { usePinnedTickets } from '@/composables/usePinnedTickets'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { LOCAL_SPACE_KEY } from '~/shared/localTickets'

const props = defineProps<{
  tickets: JiraTicket[]
  selectedKey: string | null
  collapsed: boolean
  refreshing: boolean
  currentView: string
  favoriteViews: FavoriteViewNavItem[]
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
  'favorite-view': [viewId: string]
  'add-space': []
  'leave-space': [spaceKey: string]
}>()

const { pinnedKeys } = usePinnedTickets()
const { enabledSpaces } = useSpaceSettings()

interface NavItem {
  id: string
  label: string
  icon: string
  count?: number
}

interface FavoriteViewNavItem {
  id: string
  label: string
}

interface TeamNavItem {
  key: string
  name: string
  activeCount: number
  triageCount: number
}

interface TeamMenuState {
  open: boolean
  teamKey: string
  teamName: string
  x: number
  y: number
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
const workspaceExpanded = ref(true)
const favoritesExpanded = ref(true)
const expandedTeamKeys = useLocalStorage<string[]>('jira2.expandedTeams', [])
const expandedTeamKeySet = computed(() => new Set(expandedTeamKeys.value))
const teamMenuElement = ref<HTMLElement | null>(null)
const teamMenuState = ref<TeamMenuState>({
  open: false,
  teamKey: '',
  teamName: '',
  x: 0,
  y: 0,
})
const teamMenuStyle = computed(() => {
  const leftBoundary = typeof window === 'undefined' ? teamMenuState.value.x : window.innerWidth - 184
  const topBoundary = typeof window === 'undefined' ? teamMenuState.value.y : window.innerHeight - 72

  return {
    left: `${Math.max(8, Math.min(teamMenuState.value.x, leftBoundary))}px`,
    top: `${Math.max(8, Math.min(teamMenuState.value.y, topBoundary))}px`,
  }
})

function toggleWorkspace() {
  workspaceExpanded.value = !workspaceExpanded.value
}

function toggleFavorites() {
  favoritesExpanded.value = !favoritesExpanded.value
}

function isTeamExpanded(teamKey: string): boolean {
  return expandedTeamKeySet.value.has(teamKey)
}

function expandTeam(teamKey: string): void {
  if (isTeamExpanded(teamKey)) {
    return
  }

  expandedTeamKeys.value = [...expandedTeamKeys.value, teamKey]
}

function toggleTeam(teamKey: string): void {
  if (isTeamExpanded(teamKey)) {
    expandedTeamKeys.value = expandedTeamKeys.value.filter(key => key !== teamKey)
    return
  }

  expandedTeamKeys.value = [...expandedTeamKeys.value, teamKey]
}

const primaryItems = computed<NavItem[]>(() => [
  { id: 'inbox', label: 'Inbox', icon: 'inbox', count: triageTickets.value.length },
  { id: 'my-issues', label: 'My issues', icon: 'target', count: activeTickets.value.length },
])

const workspaceItems = computed<NavItem[]>(() => [
  { id: 'initiatives', label: 'Initiatives', icon: 'initiative' },
  { id: 'projects', label: 'Projects', icon: 'project' },
  { id: 'views', label: 'Views', icon: 'view' },
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
  const teamKey = getTeamKeyFromViewId(viewId)
  if (teamKey !== null) {
    expandTeam(teamKey)
  }

  emit('view', viewId)
}

function openTeamMenu(team: TeamNavItem, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  if (team.key === LOCAL_SPACE_KEY) {
    closeTeamMenu()
    return
  }

  teamMenuState.value = {
    open: true,
    teamKey: team.key,
    teamName: team.name,
    x: event.clientX,
    y: event.clientY,
  }
}

function closeTeamMenu(): void {
  teamMenuState.value = {
    ...teamMenuState.value,
    open: false,
  }
}

function leaveCurrentTeam(): void {
  if (!teamMenuState.value.teamKey) {
    return
  }

  emit('leave-space', teamMenuState.value.teamKey)
  closeTeamMenu()
}

function handlePointerDown(event: PointerEvent): void {
  if (!teamMenuState.value.open) {
    return
  }

  const target = event.target
  if (target instanceof Node && teamMenuElement.value?.contains(target)) {
    return
  }

  closeTeamMenu()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeTeamMenu()
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('keydown', handleKeydown)
})

type TeamViewSection = 'triage' | 'all' | 'active' | 'backlog' | 'projects' | 'views'

function getTeamViewId(spaceKey: string, section: TeamViewSection): string {
  return `team:${spaceKey}:${section}`
}

function getTeamKeyFromViewId(viewId: string): string | null {
  if (!viewId.startsWith('team:')) {
    return null
  }

  const [, teamKey] = viewId.split(':')
  return teamKey || null
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
        <img src="/favicon.svg" alt="" class="h-5 w-5 shrink-0 rounded" aria-hidden="true" />
        <span v-if="!collapsed" class="truncate font-medium">BetterJira!</span>
      </button>

      <button
        v-if="!collapsed"
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8f9198] hover:bg-white/[0.05] hover:text-[#e6e7ea]"
        title="Search workspace"
        @click="emit('command')"
      >
        <Icon name="lucide:search" class="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <button
        v-if="!collapsed"
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[#d7d8dc] hover:bg-white/[0.12] hover:text-[#f0f1f4]"
        title="Create issue"
        @click="selectView('create')"
      >
        <Icon name="lucide:square-pen" class="h-3.5 w-3.5" aria-hidden="true" />
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
            <Icon
              :name="item.icon === 'inbox' ? 'lucide:inbox' : 'lucide:scan'"
              class="h-3.5 w-3.5 shrink-0 text-[#8f9198]"
              aria-hidden="true"
            />
            <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ item.label }}</span>
            <span v-if="!collapsed && item.count !== undefined && item.count > 0" class="text-[11px] text-[#6f727b]">{{ item.count }}</span>
          </button>
        </section>

        <section v-if="!collapsed" class="space-y-1">
          <button
            type="button"
            class="flex h-6 w-full items-center justify-between rounded-md px-2 text-left text-[12px] font-medium text-[#777a83] transition hover:bg-white/[0.045] hover:text-[#b9bbc3]"
            :aria-expanded="workspaceExpanded"
            @click="toggleWorkspace"
          >
            <span>Workspace</span>
            <Icon
              name="lucide:chevron-down"
              class="h-3 w-3 transition-transform"
              :class="workspaceExpanded ? '' : '-rotate-90'"
              aria-hidden="true"
            />
          </button>
          <template v-if="workspaceExpanded">
            <button
              v-for="item in workspaceItems"
              :key="item.id"
              type="button"
              class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
              :class="isActiveView(item.id) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#a9abb3] hover:bg-white/[0.045] hover:text-[#e6e7ea]'"
              @click="selectView(item.id)"
            >
              <Icon
                :name="item.icon === 'project' ? 'lucide:box' : item.icon === 'view' ? 'lucide:layers' : 'lucide:circle-dashed'"
                class="h-3.5 w-3.5 shrink-0 text-[#8f9198]"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
            </button>
          </template>
        </section>

        <section v-if="!collapsed" class="space-y-1">
          <button
            type="button"
            class="flex h-6 w-full items-center justify-between rounded-md px-2 text-left text-[12px] font-medium text-[#777a83] transition hover:bg-white/[0.045] hover:text-[#b9bbc3]"
            :aria-expanded="favoritesExpanded"
            @click="toggleFavorites"
          >
            <span>Favorites</span>
            <Icon
              name="lucide:chevron-down"
              class="h-3 w-3 transition-transform"
              :class="favoritesExpanded ? '' : '-rotate-90'"
              aria-hidden="true"
            />
          </button>
          <template v-if="favoritesExpanded">
            <button
              v-for="favoriteView in favoriteViews"
              :key="favoriteView.id"
              type="button"
              class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition"
              :class="isActiveView(favoriteView.id) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#a9abb3] hover:bg-white/[0.045] hover:text-[#e6e7ea]'"
              @click="emit('favorite-view', favoriteView.id)"
            >
              <span class="w-3.5 shrink-0 text-center text-[13px] leading-none text-[#d7a543]" aria-hidden="true">★</span>
              <span class="min-w-0 flex-1 truncate">{{ favoriteView.label }}</span>
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
              <span class="min-w-0 flex-1 truncate">{{ ticket.summary }}</span>
            </button>
          </template>
        </section>

        <section v-if="!collapsed" class="space-y-1">
          <div class="flex h-6 items-center justify-between px-2 text-[12px] font-medium text-[#777a83]">
            <span>Your teams</span>
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded text-[14px] text-[#777a83] transition hover:bg-white/[0.055] hover:text-[#f0f1f4]"
              aria-label="Add space"
              @click="emit('add-space')"
            >
              ＋
            </button>
          </div>

          <div v-for="team in teamItems" :key="team.key" class="space-y-0.5">
            <div
              class="flex h-7 w-full items-center rounded-md text-[13px] text-[#c6c8ce] transition hover:bg-white/[0.045] hover:text-[#f0f1f4]"
              :class="viewNavigationIsActive && currentViewId.startsWith(`team:${team.key}:`) ? 'bg-white/[0.055]' : ''"
              @contextmenu="openTeamMenu(team, $event)"
            >
              <button
                type="button"
                class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-l-md px-2 text-left"
                @click="selectView(getTeamViewId(team.key, 'active'))"
              >
                <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-[#d65d5d] text-[9px] text-white">{{ team.key.slice(0, 1) }}</span>
                <span class="min-w-0 flex-1 truncate">{{ team.name }}</span>
                <span v-if="team.activeCount > 0" class="text-[11px] text-[#6f727b]">{{ team.activeCount }}</span>
              </button>
              <button
                type="button"
                class="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#6f727b] transition hover:bg-white/[0.06] hover:text-[#f0f1f4]"
                :aria-expanded="isTeamExpanded(team.key)"
                :aria-label="`${isTeamExpanded(team.key) ? 'Collapse' : 'Expand'} ${team.name}`"
                @click.stop="toggleTeam(team.key)"
              >
                <Icon
                  name="lucide:chevron-down"
                  class="h-3.5 w-3.5 transition-transform"
                  :class="isTeamExpanded(team.key) ? '' : '-rotate-90'"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div v-if="isTeamExpanded(team.key)" class="ml-5 space-y-0.5">
              <button
                type="button"
                class="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition"
                :class="isActiveView(getTeamViewId(team.key, 'triage')) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="selectView(getTeamViewId(team.key, 'triage'))"
              >
                <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-current" aria-hidden="true">
                  <Icon name="lucide:arrow-left-right" class="h-2.5 w-2.5" />
                </span>
                <span class="flex-1 truncate">Triage</span>
                <span v-if="team.triageCount > 0">{{ team.triageCount }}</span>
              </button>
              <button
                type="button"
                class="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition"
                :class="isTeamIssuesView(team.key) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="selectView(getTeamViewId(team.key, 'active'))"
              >
                <Icon name="lucide:copy" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span class="flex-1 truncate">Issues</span>
              </button>
              <button
                type="button"
                class="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition"
                :class="isActiveView(getTeamViewId(team.key, 'projects')) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="selectView(getTeamViewId(team.key, 'projects'))"
              >
                <Icon name="lucide:box" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span class="flex-1 truncate">Projects</span>
              </button>
              <button
                type="button"
                class="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition"
                :class="isActiveView(getTeamViewId(team.key, 'views')) ? 'bg-white/[0.08] text-[#f0f1f4]' : 'text-[#8f9198] hover:bg-white/[0.045] hover:text-[#d7d8dc]'"
                @click="selectView(getTeamViewId(team.key, 'views'))"
              >
                <Icon name="lucide:layers" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
        <Icon name="lucide:settings" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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

    <Teleport to="body">
      <div
        v-if="teamMenuState.open"
        ref="teamMenuElement"
        class="fixed z-[100] w-44 overflow-hidden rounded-xl border border-white/[0.08] bg-[#11131a]/95 p-1 text-sm text-slate-200 shadow-2xl shadow-black/40 backdrop-blur"
        :style="teamMenuStyle"
        role="menu"
        @contextmenu.prevent
      >
        <div class="border-b border-white/[0.06] px-2 py-1.5">
          <p class="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{{ teamMenuState.teamName }}</p>
        </div>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-rose-300 transition hover:bg-rose-500/[0.12] hover:text-rose-200"
          role="menuitem"
          @click="leaveCurrentTeam"
        >
          <Icon name="lucide:log-out" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Leave space</span>
        </button>
      </div>
    </Teleport>
  </aside>
</template>
