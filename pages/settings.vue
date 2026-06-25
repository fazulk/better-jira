<script setup lang="ts">
import SettingsPage from '@/components/SettingsPage.vue'

definePageMeta({
  key: 'settings',
})

function closeSettings(): void {
  void navigateTo('/')
}
</script>

<template>
  <main class="h-screen overflow-hidden">
    <SettingsPage @close="closeSettings" />
  </main>
</template>
