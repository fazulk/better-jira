<script setup lang="ts">
import { computed, watch } from 'vue'
import { useAvailableSpaces } from '@/composables/useAvailableSpaces'
import { useSpaceSettings } from '@/composables/useSpaceSettings'

const { hasJiraCredentialsConfigured, isLoading } = useSpaceSettings()
const { ensureAvailableSpacesLoaded } = useAvailableSpaces(hasJiraCredentialsConfigured)

const showJiraSetupModal = computed(() => !isLoading.value && !hasJiraCredentialsConfigured.value)

watch(
  [isLoading, hasJiraCredentialsConfigured],
  ([settingsAreLoading, jiraIsConfigured]) => {
    if (settingsAreLoading || !jiraIsConfigured) {
      return
    }

    void ensureAvailableSpacesLoaded()
  },
  { immediate: true },
)
</script>

<template>
  <NuxtPage />
  <JiraSetupModal :open="showJiraSetupModal" />
  <AppToastContainer />
</template>
