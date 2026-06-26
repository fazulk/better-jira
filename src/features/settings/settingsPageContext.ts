import { inject, provide, type InjectionKey } from 'vue'
import { useSettingsPageState } from './useSettingsPageState'

export type SettingsPageContext = ReturnType<typeof useSettingsPageState>

const settingsPageContextKey: InjectionKey<SettingsPageContext> = Symbol('settings-page-context')

export function provideSettingsPageContext(context: SettingsPageContext): void {
  provide(settingsPageContextKey, context)
}

export function useSettingsPageContext(): SettingsPageContext {
  const context = inject(settingsPageContextKey)
  if (!context) {
    throw new Error('Settings page context was not provided.')
  }
  return context
}
