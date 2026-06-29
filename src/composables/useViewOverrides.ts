import type { ViewOverride } from '~/shared/settings'
import { ref, watch } from 'vue'
import { useSpaceSettings } from '@/composables/useSpaceSettings'

export function useViewOverrides() {
  const { settings, setSidebarSettings } = useSpaceSettings()
  const viewOverrides = ref<Record<string, ViewOverride>>(
    copyViewOverrides(settings.value.sidebar.viewOverrides),
  )
  const pendingViewOverrides = ref<Record<string, ViewOverride> | null>(null)
  let persistPromise: Promise<void> | null = null

  watch(
    () => settings.value.sidebar.viewOverrides,
    (nextOverrides) => {
      if (persistPromise || pendingViewOverrides.value) {
        return
      }
      viewOverrides.value = copyViewOverrides(nextOverrides)
    },
    { deep: true },
  )

  function queuePersistViewOverrides(value: Record<string, ViewOverride>): void {
    const nextOverrides = copyViewOverrides(value)
    viewOverrides.value = nextOverrides
    pendingViewOverrides.value = nextOverrides

    if (!persistPromise) {
      persistPromise = flushPendingViewOverrides()
    }
  }

  async function flushPendingViewOverrides(): Promise<void> {
    try {
      while (pendingViewOverrides.value) {
        const nextOverrides = pendingViewOverrides.value
        pendingViewOverrides.value = null
        await setSidebarSettings({
          viewOverrides: nextOverrides,
        })
      }
    }
    finally {
      persistPromise = null
      if (pendingViewOverrides.value) {
        persistPromise = flushPendingViewOverrides()
      }
    }
  }

  function getViewOverride(viewId: string): ViewOverride | null {
    return viewOverrides.value[viewId] ?? null
  }

  function upsertViewOverride(viewId: string, override: ViewOverride): void {
    queuePersistViewOverrides({
      ...viewOverrides.value,
      [viewId]: copyViewOverride(override),
    })
  }

  function removeViewOverride(viewId: string): void {
    if (!Object.hasOwn(viewOverrides.value, viewId)) {
      return
    }

    const nextOverrides = { ...viewOverrides.value }
    delete nextOverrides[viewId]
    queuePersistViewOverrides(nextOverrides)
  }

  return {
    viewOverrides,
    getViewOverride,
    upsertViewOverride,
    removeViewOverride,
  }
}

function copyViewOverrides(value: Record<string, ViewOverride>): Record<string, ViewOverride> {
  const copy: Record<string, ViewOverride> = {}

  for (const [viewId, override] of Object.entries(value)) {
    copy[viewId] = copyViewOverride(override)
  }

  return copy
}

function copyViewOverride(override: ViewOverride): ViewOverride {
  return {
    filters: override.filters.map(filter => ({ ...filter })),
    display: {
      ...override.display,
      issueGroupOrders: copyStringListRecord(override.display.issueGroupOrders),
      hiddenIssueGroupIds: copyStringListRecord(override.display.hiddenIssueGroupIds),
      collapsedIssueSectionIds: [...override.display.collapsedIssueSectionIds],
      visibleIssueRowFields: [...override.display.visibleIssueRowFields],
      visibleProjectRowFields: [...override.display.visibleProjectRowFields],
      collapsedProjectSectionIds: [...override.display.collapsedProjectSectionIds],
      visibleInitiativeRowFields: [...override.display.visibleInitiativeRowFields],
      visibleSavedViewRowFields: [...override.display.visibleSavedViewRowFields],
    },
  }
}

function copyStringListRecord(value: Record<string, string[]>): Record<string, string[]> {
  const copy: Record<string, string[]> = {}

  for (const [key, entries] of Object.entries(value)) {
    copy[key] = [...entries]
  }

  return copy
}
