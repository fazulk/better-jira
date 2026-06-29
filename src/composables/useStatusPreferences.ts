import type { ComputedRef } from 'vue'
import type { JiraTicket } from '@/types/jira'
import type { StatusColors, StatusPreferences } from '~/shared/settings'
import { computed } from 'vue'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { getStatusGroup } from '@/types/jira'

export type StatusLane = 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed'

export const STATUS_COLOR_PALETTE = [
  '#ff6b35',
  '#8f9198',
  '#a8b3c5',
  '#f59e0b',
  '#eab308',
  '#22d3ee',
  '#34d399',
  '#6366f1',
  '#a855f7',
  '#f43f5e',
]

const fallbackLaneColors: Record<StatusLane, string> = {
  triage: '#ff6b35',
  backlog: '#8f9198',
  unstarted: '#a8b3c5',
  started: '#f59e0b',
  completed: '#6366f1',
}

const laneRanks: Record<StatusLane, number> = {
  triage: 0,
  backlog: 1,
  unstarted: 2,
  started: 3,
  completed: 4,
}

// Hardcoded default order applied before any user customization. Matched by
// normalized status name; unknown statuses fall back to lane order + alpha.
export const DEFAULT_STATUS_NAME_ORDER: readonly string[] = [
  'triage',
  'backlog',
  'to do',
  'todo',
  'approved for development',
  'in progress',
  'blocked',
  'code review',
  'ready for qa',
  'in qa',
  'hotfix - pending qa',
  'passed qa',
  'ready for deployment',
  'deployment approved',
  'done',
]

// Approximate workflow progress for "started" statuses so the pie icon fills
// proportionally as work advances, mimicking Linear's status icons.
const STARTED_PROGRESS_ORDER: readonly string[] = [
  'in progress',
  'blocked',
  'code review',
  'ready for qa',
  'in qa',
  'hotfix - pending qa',
  'passed qa',
  'ready for deployment',
  'deployment approved',
]

export function getStatusProgress(status: string, statusCategory: string): number {
  const lane = getStatusLane(status, statusCategory)
  if (lane === 'completed') {
    return 1
  }
  if (lane !== 'started') {
    return 0
  }

  const index = STARTED_PROGRESS_ORDER.indexOf(normalizeStatusName(status))
  if (index === -1) {
    return 0.5
  }
  if (STARTED_PROGRESS_ORDER.length <= 1) {
    return 0.5
  }
  return 0.2 + 0.65 * (index / (STARTED_PROGRESS_ORDER.length - 1))
}

function getDefaultStatusRank(status: string, statusCategory: string): number {
  const index = DEFAULT_STATUS_NAME_ORDER.indexOf(normalizeStatusName(status))
  if (index !== -1) {
    return index
  }
  // Unknown statuses sort after known ones, grouped by lane.
  return DEFAULT_STATUS_NAME_ORDER.length + getStatusLaneRank(getStatusLane(status, statusCategory))
}

interface StatusPreferenceApi {
  statusColorPalette: string[]
  statusPreferences: ComputedRef<StatusPreferences>
  getStatusColor: (status: string, statusCategory: string) => string
  getStatusPreferenceKey: (status: string, statusCategory: string) => string
  getStatusOrderRank: (status: string, statusCategory: string) => number
  getStatusLane: (status: string, statusCategory: string) => StatusLane
  setStatusColor: (status: string, statusCategory: string, color: string) => void
  resetStatusColor: (status: string, statusCategory: string) => void
  setStatusOrder: (orderedKeys: readonly string[]) => void
}

function normalizeHexColor(color: string): string | null {
  const normalizedColor = color.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalizedColor) ? normalizedColor : null
}

function normalizeStatusName(status: string): string {
  const normalizedStatus = status.trim().toLowerCase()
  return normalizedStatus || 'no status'
}

function normalizeStatusPreferenceKey(value: string): string {
  return value.trim().toLowerCase()
}

export function getStatusPreferenceKey(status: string, statusCategory: string): string {
  return `${getStatusGroup(statusCategory)}:${normalizeStatusName(status)}`
}

export function getStatusLane(status: string, statusCategory: string): StatusLane {
  const normalizedStatus = normalizeStatusName(status)
  if (normalizedStatus.includes('triage') || normalizedStatus.includes('intake')) {
    return 'triage'
  }
  if (normalizedStatus.includes('backlog')) {
    return 'backlog'
  }

  const group = getStatusGroup(statusCategory)
  if (group === 'done') {
    return 'completed'
  }
  if (group === 'new') {
    return 'unstarted'
  }
  return 'started'
}

export function getStatusLaneLabel(lane: StatusLane): string {
  if (lane === 'triage')
    return 'Triage'
  if (lane === 'backlog')
    return 'Backlog'
  if (lane === 'unstarted')
    return 'Unstarted'
  if (lane === 'started')
    return 'Started'
  return 'Completed'
}

export function getStatusLaneRank(lane: StatusLane): number {
  return laneRanks[lane]
}

export function getStatusLaneIcon(lane: StatusLane): string {
  if (lane === 'triage')
    return '↔'
  if (lane === 'backlog')
    return '◌'
  if (lane === 'unstarted')
    return '○'
  if (lane === 'completed')
    return '✓'
  return '◔'
}

export function getFallbackStatusColor(status: string, statusCategory: string): string {
  return fallbackLaneColors[getStatusLane(status, statusCategory)]
}

export function createStatusIconStyle(color: string): Record<string, string> {
  return {
    backgroundColor: `${color}22`,
    borderColor: `${color}33`,
    color,
  }
}

export function createStatusMarkerStyle(color: string): Record<string, string> {
  return {
    borderColor: color,
    color,
  }
}

export function createStatusBadgeStyle(color: string): Record<string, string> {
  return {
    backgroundColor: `${color}22`,
    borderColor: `${color}33`,
    color,
  }
}

export function compareStatusesByPreference(
  left: Pick<JiraTicket, 'status' | 'statusCategory'>,
  right: Pick<JiraTicket, 'status' | 'statusCategory'>,
  order: readonly string[],
): number {
  const leftKey = getStatusPreferenceKey(left.status, left.statusCategory)
  const rightKey = getStatusPreferenceKey(right.status, right.statusCategory)
  const leftIndex = order.indexOf(leftKey)
  const rightIndex = order.indexOf(rightKey)

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1)
      return 1
    if (rightIndex === -1)
      return -1
    return leftIndex - rightIndex
  }

  return getDefaultStatusRank(left.status, left.statusCategory)
    - getDefaultStatusRank(right.status, right.statusCategory)
    || left.status.localeCompare(right.status)
}

let statusPreferenceApi: StatusPreferenceApi | null = null

export function useStatusPreferences(): StatusPreferenceApi {
  if (statusPreferenceApi) {
    return statusPreferenceApi
  }

  const { settings, setStatusPreferences } = useSpaceSettings()
  const statusPreferences = computed<StatusPreferences>(() => settings.value.statusPreferences)

  function getStatusColor(status: string, statusCategory: string): string {
    const key = getStatusPreferenceKey(status, statusCategory)
    return statusPreferences.value.colors[key] ?? getFallbackStatusColor(status, statusCategory)
  }

  function getStatusOrderRank(status: string, statusCategory: string): number {
    const key = getStatusPreferenceKey(status, statusCategory)
    const index = statusPreferences.value.order.indexOf(key)
    if (index !== -1) {
      return index
    }

    return statusPreferences.value.order.length + getDefaultStatusRank(status, statusCategory)
  }

  function persistStatusPreferences(nextStatusPreferences: StatusPreferences): void {
    void setStatusPreferences(nextStatusPreferences).catch((error: unknown) => {
      console.error('Failed to save status preferences:', error)
    })
  }

  function setStatusColor(status: string, statusCategory: string, color: string): void {
    const normalizedColor = normalizeHexColor(color)
    if (!normalizedColor) {
      return
    }

    persistStatusPreferences({
      ...statusPreferences.value,
      colors: {
        ...statusPreferences.value.colors,
        [getStatusPreferenceKey(status, statusCategory)]: normalizedColor,
      },
    })
  }

  function resetStatusColor(status: string, statusCategory: string): void {
    const key = getStatusPreferenceKey(status, statusCategory)
    const nextColors: StatusColors = { ...statusPreferences.value.colors }
    delete nextColors[key]

    persistStatusPreferences({
      ...statusPreferences.value,
      colors: nextColors,
    })
  }

  function setStatusOrder(orderedKeys: readonly string[]): void {
    const normalizedKeys = new Set<string>()
    for (const key of orderedKeys) {
      const normalizedKey = normalizeStatusPreferenceKey(key)
      if (normalizedKey) {
        normalizedKeys.add(normalizedKey)
      }
    }

    persistStatusPreferences({
      ...statusPreferences.value,
      order: [...normalizedKeys],
    })
  }

  const api: StatusPreferenceApi = {
    statusColorPalette: STATUS_COLOR_PALETTE,
    statusPreferences,
    getStatusColor,
    getStatusPreferenceKey,
    getStatusOrderRank,
    getStatusLane,
    setStatusColor,
    resetStatusColor,
    setStatusOrder,
  }

  statusPreferenceApi = api
  return api
}
