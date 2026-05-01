import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  updateAiConnection as persistAiConnection,
  fetchAppSettings,
  updateAppSettings as persistAppSettings,
  updateJiraConnection as persistJiraConnection,
} from '@/api/settings'
import {
  getDefaultAppSettings,
  hasConfiguredJiraCredentials,
  reconcileAppSettings,
  type AiInstructionPresetSetting,
  type AppSettings,
  type AppSpaceSetting,
  type UpdateAiConnectionInput,
  type UpdateJiraConnectionInput,
  type UpdateSidebarSettingsInput,
} from '~/shared/settings'
import { LOCAL_SPACE_KEY } from '~/shared/localTickets'
import { jiraCurrentUserQueryKey } from '@/composables/useJiraCurrentUser'
import { jiraSpaceDirectoryQueryKey, resetAvailableSpacesBootstrap } from '@/composables/useAvailableSpaces'

export const APP_SETTINGS_QUERY_KEY = ['app-settings'] as const
const TICKETS_QUERY_KEY = ['tickets'] as const

interface SpaceMutationInput {
  key: string
  name?: string
}

function normalizeSpaceKey(value: string): string {
  return value.trim().toUpperCase()
}

function normalizeSpaceName(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function useSpaceSettings() {
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: fetchAppSettings,
  })

  const settingsMutation = useMutation({
    mutationFn: persistAppSettings,
  })
  const jiraConnectionMutation = useMutation({
    mutationFn: persistJiraConnection,
  })
  const aiConnectionMutation = useMutation({
    mutationFn: persistAiConnection,
  })

  const settings = computed<AppSettings>(() => reconcileAppSettings(settingsQuery.data.value ?? getDefaultAppSettings()))
  const spaces = computed(() => settings.value.spaces)
  const enabledSpaces = computed(() => settings.value.spaces.filter(space => space.enabled))
  const disabledSpaces = computed(() => settings.value.spaces.filter(space => !space.enabled))
  const jiraConnection = computed(() => settings.value.jira)
  const aiConnection = computed(() => settings.value.ai)
  const hasJiraCredentialsConfigured = computed(() => hasConfiguredJiraCredentials(settings.value))

  async function updateSettings(nextSettings: Partial<AppSettings>, invalidateTickets: boolean): Promise<void> {
    const previousSettings = settings.value
    const mergedSettings = reconcileAppSettings({
      ...previousSettings,
      ...nextSettings,
    })

    queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, mergedSettings)

    try {
      const persistedSettings = await settingsMutation.mutateAsync(mergedSettings)
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, persistedSettings)

      if (invalidateTickets) {
        await queryClient.invalidateQueries({
          queryKey: TICKETS_QUERY_KEY,
        })
      }
    } catch (error) {
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, previousSettings)
      throw error
    }
  }

  async function setFilterSpaceKeys(filterSpaceKeys: string[]): Promise<void> {
    const enabledSpaceKeySet = new Set(enabledSpaces.value.map(space => space.key))

    await updateSettings({
      filterSpaceKeys: filterSpaceKeys
        .map(normalizeSpaceKey)
        .filter((spaceKey) => enabledSpaceKeySet.has(spaceKey)),
    }, false)
  }

  async function setSidebarSettings(sidebarSettings: UpdateSidebarSettingsInput): Promise<void> {
    await updateSettings({
      sidebar: {
        ...settings.value.sidebar,
        ...sidebarSettings,
      },
    }, false)
  }

  async function setAiInstructionPresets(aiInstructionPresets: AiInstructionPresetSetting[]): Promise<void> {
    await updateSettings({
      aiInstructionPresets,
    }, false)
  }

  async function addOrEnableSpace(space: SpaceMutationInput): Promise<void> {
    const key = normalizeSpaceKey(space.key)
    if (!key) {
      throw new Error('Space key is required.')
    }

    const nextName = normalizeSpaceName(space.name)
    const existingSpace = settings.value.spaces.find(currentSpace => currentSpace.key === key)

    const nextSpaces = existingSpace
      ? settings.value.spaces.map((currentSpace): AppSpaceSetting => {
        if (currentSpace.key !== key) {
          return currentSpace
        }

        return {
          key: currentSpace.key,
          name: nextName || currentSpace.name || currentSpace.key,
          enabled: true,
        }
      })
      : [
        ...settings.value.spaces,
        {
          key,
          name: nextName || key,
          enabled: true,
        },
      ]

    await updateSettings({
      spaces: nextSpaces,
      // Clearing the sidebar's saved space filter makes newly enabled spaces visible immediately.
      filterSpaceKeys: [],
    }, true)
  }

  async function disableSpace(spaceKey: string): Promise<void> {
    const normalizedSpaceKey = normalizeSpaceKey(spaceKey)

    const nextSpaces = settings.value.spaces.map((space): AppSpaceSetting => (
      space.key === normalizedSpaceKey
        ? {
          key: space.key,
          name: space.name,
          enabled: false,
        }
        : space
    ))

    await updateSettings({
      spaces: nextSpaces,
      filterSpaceKeys: settings.value.filterSpaceKeys.filter((key) => key !== normalizedSpaceKey),
    }, true)
  }

  async function deleteSpace(spaceKey: string): Promise<void> {
    const normalizedSpaceKey = normalizeSpaceKey(spaceKey)
    if (normalizedSpaceKey === LOCAL_SPACE_KEY) {
      throw new Error('The Local space cannot be removed.')
    }

    await updateSettings({
      spaces: settings.value.spaces.filter(space => space.key !== normalizedSpaceKey),
      filterSpaceKeys: settings.value.filterSpaceKeys.filter((key) => key !== normalizedSpaceKey),
    }, true)
  }

  async function updateJiraCredentials(input: UpdateJiraConnectionInput): Promise<void> {
    const previousSettings = settings.value
    const mergedSettings = reconcileAppSettings({
      ...previousSettings,
      jira: {
        baseUrl: input.baseUrl ?? previousSettings.jira.baseUrl,
        email: input.email ?? previousSettings.jira.email,
        hasApiToken: input.apiToken === undefined
          ? previousSettings.jira.hasApiToken
          : input.apiToken.length > 0,
      },
    })

    queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, mergedSettings)

    try {
      const persistedSettings = await jiraConnectionMutation.mutateAsync(input)
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, persistedSettings)
      resetAvailableSpacesBootstrap()
      queryClient.removeQueries({
        queryKey: jiraSpaceDirectoryQueryKey,
      })
      await queryClient.invalidateQueries({
        queryKey: TICKETS_QUERY_KEY,
      })
      await queryClient.invalidateQueries({
        queryKey: jiraCurrentUserQueryKey,
      })
    } catch (error) {
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, previousSettings)
      throw error
    }
  }

  async function updateAiCredentials(input: UpdateAiConnectionInput): Promise<void> {
    const previousSettings = settings.value
    const mergedSettings = reconcileAppSettings({
      ...previousSettings,
      ai: {
        hasCerebrasApiKey: input.cerebrasApiKey === undefined
          ? previousSettings.ai.hasCerebrasApiKey
          : input.cerebrasApiKey.length > 0,
        provider: input.provider ?? previousSettings.ai.provider,
        model: input.model ?? previousSettings.ai.model,
      },
    })

    queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, mergedSettings)

    try {
      const persistedSettings = await aiConnectionMutation.mutateAsync(input)
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, persistedSettings)
    } catch (error) {
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, previousSettings)
      throw error
    }
  }

  return {
    settings,
    spaces,
    enabledSpaces,
    disabledSpaces,
    jiraConnection,
    aiConnection,
    hasJiraCredentialsConfigured,
    isLoading: computed(() => settingsQuery.isLoading.value),
    isSaving: computed(() => (
      settingsMutation.isPending.value
      || jiraConnectionMutation.isPending.value
      || aiConnectionMutation.isPending.value
    )),
    setFilterSpaceKeys,
    setSidebarSettings,
    setAiInstructionPresets,
    addOrEnableSpace,
    disableSpace,
    deleteSpace,
    updateJiraCredentials,
    updateAiCredentials,
  }
}
