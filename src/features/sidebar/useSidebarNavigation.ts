import type { JiraTicket } from '@/types/jira'
import { useLocalStorage } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePinnedTickets } from '@/composables/usePinnedTickets'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { getStatusGroup } from '@/types/jira'
import { LOCAL_SPACE_KEY } from '~/shared/localTickets'

export interface FavoriteViewNavItem {
  id: string
  label: string
}

interface SidebarNavigationProps {
  tickets: JiraTicket[]
  selectedKey: string | null
  currentView: string
}

interface SidebarNavigationEmit {
  (event: 'view', viewId: string): void
  (event: 'leave-space', spaceKey: string): void
}

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

interface TeamMenuState {
  open: boolean
  teamKey: string
  teamName: string
  x: number
  y: number
}

type TeamViewSection = 'triage' | 'all' | 'active' | 'backlog' | 'projects' | 'views' | 'project-views'

export function getTeamViewId(spaceKey: string, section: TeamViewSection): string {
  return `team:${spaceKey}:${section}`
}

function getTeamKeyFromViewId(viewId: string): string | null {
  if (!viewId.startsWith('team:')) {
    return null
  }

  const [, teamKey] = viewId.split(':')
  return teamKey || null
}

function isEpicIssue(ticket: JiraTicket): boolean {
  return isEpicIssueType(ticket.issueType)
}

function isEpicIssueType(issueType: string): boolean {
  return issueType.toLowerCase().includes('epic')
}

export function useSidebarNavigation(
  props: SidebarNavigationProps,
  emit: SidebarNavigationEmit,
) {
  const { pinnedKeys } = usePinnedTickets()
  const { enabledSpaces } = useSpaceSettings()

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

  const primaryItems = computed<NavItem[]>(() => [
    { id: 'inbox', label: 'Inbox', icon: 'inbox', count: triageTickets.value.length },
    { id: 'my-issues', label: 'My issues', icon: 'target', count: activeTickets.value.length },
  ])

  const workspaceItems = computed<NavItem[]>(() => [
    { id: 'projects', label: 'Projects', icon: 'project' },
    { id: 'views', label: 'Views', icon: 'view' },
  ])

  const ticketByKey = computed(() => new Map(visibleTickets.value.map<readonly [string, JiraTicket]>(ticket => [ticket.key, ticket])))
  const pinnedTickets = computed(() => pinnedKeys.value
    .map(key => ticketByKey.value.get(key))
    .filter((ticket): ticket is JiraTicket => ticket !== undefined)
    .slice(0, 6))

  const teamItems = computed<TeamNavItem[]>(() => enabledSpaces.value.map((space) => {
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

  function isTeamIssuesView(spaceKey: string): boolean {
    return viewNavigationIsActive.value && (
      currentViewId.value === getTeamViewId(spaceKey, 'all')
      || currentViewId.value === getTeamViewId(spaceKey, 'active')
      || currentViewId.value === getTeamViewId(spaceKey, 'backlog')
    )
  }

  function isTeamViewsView(spaceKey: string): boolean {
    return viewNavigationIsActive.value && (
      currentViewId.value === getTeamViewId(spaceKey, 'views')
      || currentViewId.value === getTeamViewId(spaceKey, 'project-views')
    )
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

  return {
    currentViewId,
    favoritesExpanded,
    getTeamViewId,
    isActiveView,
    isTeamExpanded,
    isTeamIssuesView,
    isTeamViewsView,
    leaveCurrentTeam,
    openTeamMenu,
    pinnedTickets,
    primaryItems,
    selectView,
    teamItems,
    teamMenuElement,
    teamMenuState,
    teamMenuStyle,
    toggleFavorites,
    toggleTeam,
    toggleWorkspace,
    viewNavigationIsActive,
    workspaceExpanded,
    workspaceItems,
  }
}
