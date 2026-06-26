import type {
  CustomView,
  CustomViewDisplay,
  CustomViewFilter,
  FavoriteView,
  FavoriteViewFilter,
} from './settingsTypes'
import {
  normalizeBoolean,
  normalizeStringList,
  normalizeStringListRecord,
} from './settingsNormalizers'

function normalizeFavoriteViewFilter(value: unknown): FavoriteViewFilter | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const recordValue: Record<string, unknown> = value
  const id = typeof recordValue.id === 'string' ? recordValue.id.trim() : ''
  const fieldId = typeof recordValue.fieldId === 'string' ? recordValue.fieldId.trim() : ''
  const fieldLabel = typeof recordValue.fieldLabel === 'string' ? recordValue.fieldLabel.trim() : ''
  const filterValue = typeof recordValue.value === 'string' ? recordValue.value.trim() : ''
  const valueLabel = typeof recordValue.valueLabel === 'string' ? recordValue.valueLabel.trim() : ''

  if (!id || !fieldId || !fieldLabel || !filterValue || !valueLabel) {
    return null
  }

  return {
    id,
    fieldId,
    fieldLabel,
    value: filterValue,
    valueLabel,
  }
}

export function normalizeFavoriteViews(value: unknown): FavoriteView[] {
  if (!Array.isArray(value)) {
    return []
  }

  const favoriteViewsById = new Map<string, FavoriteView>()

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const recordValue: Record<string, unknown> = entry
    const id = typeof recordValue.id === 'string' ? recordValue.id.trim() : ''

    if (!id || favoriteViewsById.has(id)) {
      continue
    }

    const filters = Array.isArray(recordValue.filters)
      ? recordValue.filters
          .map(normalizeFavoriteViewFilter)
          .filter((filter): filter is FavoriteViewFilter => filter !== null)
      : []

    favoriteViewsById.set(id, {
      id,
      filters,
    })
  }

  return [...favoriteViewsById.values()]
}

function getDefaultCustomViewDisplay(): CustomViewDisplay {
  return {
    grouping: 'none',
    subGrouping: 'none',
    ordering: 'manual',
    groupingDirection: 'asc',
    orderingDirection: 'asc',
    completedRange: 'hidden',
    showSubIssuesRange: 'hidden',
    showTriageIssuesRange: 'hidden',
    showEmptyGroups: false,
    issueGroupOrders: {},
    hiddenIssueGroupIds: {},
    collapsedIssueSectionIds: [],
    visibleIssueRowFields: ['id', 'status', 'assignee', 'priority', 'project', 'due', 'labels', 'created'],
    visibleProjectRowFields: ['health', 'priority', 'lead', 'targetDate', 'issues', 'status'],
  }
}

function normalizeDirectionValue(value: unknown): 'asc' | 'desc' {
  return value === 'desc' ? 'desc' : 'asc'
}

function normalizeIssueVisibilityRangeValue(
  value: unknown,
  legacyBooleanValue: unknown,
  defaultValue: string,
): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (typeof legacyBooleanValue === 'boolean') {
    return legacyBooleanValue ? 'all' : 'hidden'
  }
  return defaultValue
}

function normalizeCustomViewDisplay(value: unknown): CustomViewDisplay {
  const defaults = getDefaultCustomViewDisplay()

  if (typeof value !== 'object' || value === null) {
    return defaults
  }

  const recordValue: Record<string, unknown> = value
  const visibleIssueRowFields = normalizeStringList(recordValue.visibleIssueRowFields)
  const visibleProjectRowFields = normalizeStringList(recordValue.visibleProjectRowFields)

  return {
    grouping: typeof recordValue.grouping === 'string' && recordValue.grouping.trim() ? recordValue.grouping.trim() : defaults.grouping,
    subGrouping: typeof recordValue.subGrouping === 'string' && recordValue.subGrouping.trim() ? recordValue.subGrouping.trim() : defaults.subGrouping,
    ordering: typeof recordValue.ordering === 'string' && recordValue.ordering.trim() ? recordValue.ordering.trim() : defaults.ordering,
    groupingDirection: normalizeDirectionValue(recordValue.groupingDirection),
    orderingDirection: normalizeDirectionValue(recordValue.orderingDirection),
    completedRange: typeof recordValue.completedRange === 'string' && recordValue.completedRange.trim() ? recordValue.completedRange.trim() : defaults.completedRange,
    showSubIssuesRange: normalizeIssueVisibilityRangeValue(
      recordValue.showSubIssuesRange,
      recordValue.showSubIssueContext,
      defaults.showSubIssuesRange,
    ),
    showTriageIssuesRange: typeof recordValue.showTriageIssuesRange === 'string' && recordValue.showTriageIssuesRange.trim() ? recordValue.showTriageIssuesRange.trim() : defaults.showTriageIssuesRange,
    showEmptyGroups: normalizeBoolean(recordValue.showEmptyGroups, defaults.showEmptyGroups),
    issueGroupOrders: normalizeStringListRecord(recordValue.issueGroupOrders),
    hiddenIssueGroupIds: normalizeStringListRecord(recordValue.hiddenIssueGroupIds),
    collapsedIssueSectionIds: normalizeStringList(recordValue.collapsedIssueSectionIds),
    visibleIssueRowFields: visibleIssueRowFields.length > 0 ? visibleIssueRowFields : defaults.visibleIssueRowFields,
    visibleProjectRowFields: visibleProjectRowFields.length > 0 ? visibleProjectRowFields : defaults.visibleProjectRowFields,
  }
}

function normalizeCustomViewFilter(value: unknown): CustomViewFilter | null {
  const filter = normalizeFavoriteViewFilter(value)
  if (!filter) {
    return null
  }

  return {
    id: filter.id,
    fieldId: filter.fieldId,
    fieldLabel: filter.fieldLabel,
    value: filter.value,
    valueLabel: filter.valueLabel,
  }
}

export function normalizeCustomViews(value: unknown): CustomView[] {
  if (!Array.isArray(value)) {
    return []
  }

  const customViewsById = new Map<string, CustomView>()

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const recordValue: Record<string, unknown> = entry
    const id = typeof recordValue.id === 'string' ? recordValue.id.trim() : ''
    const name = typeof recordValue.name === 'string' ? recordValue.name.trim() : ''
    const contextKey = typeof recordValue.contextKey === 'string' ? recordValue.contextKey.trim() : ''

    if (!id || !name || !contextKey || customViewsById.has(id)) {
      continue
    }

    const filters = Array.isArray(recordValue.filters)
      ? recordValue.filters
          .map(normalizeCustomViewFilter)
          .filter((filter): filter is CustomViewFilter => filter !== null)
      : []

    customViewsById.set(id, {
      id,
      name,
      description: typeof recordValue.description === 'string' ? recordValue.description.trim() : '',
      contextKey,
      filters,
      display: normalizeCustomViewDisplay(recordValue.display),
    })
  }

  return [...customViewsById.values()]
}
