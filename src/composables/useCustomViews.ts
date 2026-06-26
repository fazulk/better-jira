import type { CustomView } from '~/shared/settings'
import { computed } from 'vue'
import { useSpaceSettings } from '@/composables/useSpaceSettings'

export function useCustomViews() {
  const { settings, setSidebarSettings } = useSpaceSettings()
  const customViews = computed<CustomView[]>({
    get: () => settings.value.sidebar.customViews,
    set: (value) => {
      void setSidebarSettings({
        customViews: value,
      })
    },
  })

  function getCustomView(id: string): CustomView | null {
    return customViews.value.find(view => view.id === id) ?? null
  }

  function customViewsForContext(contextKey: string): CustomView[] {
    return customViews.value.filter(view => view.contextKey === contextKey)
  }

  function upsertCustomView(view: CustomView): void {
    const existingIndex = customViews.value.findIndex(existingView => existingView.id === view.id)

    if (existingIndex === -1) {
      customViews.value = [view, ...customViews.value]
      return
    }

    customViews.value = customViews.value.map(existingView => (
      existingView.id === view.id ? view : existingView
    ))
  }

  function removeCustomView(id: string): void {
    customViews.value = customViews.value.filter(view => view.id !== id)
  }

  return {
    customViews,
    getCustomView,
    customViewsForContext,
    upsertCustomView,
    removeCustomView,
  }
}
