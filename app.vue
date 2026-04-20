<script setup lang="ts">
import { computed } from 'vue'
import { useSpaceSettings } from '@/composables/useSpaceSettings'

const { hasJiraCredentialsConfigured, isLoading } = useSpaceSettings()

const showJiraSetupModal = computed(() => !isLoading.value && !hasJiraCredentialsConfigured.value)
</script>

<template>
  <NuxtPage />
  <JiraSetupModal :open="showJiraSetupModal" />
</template>
