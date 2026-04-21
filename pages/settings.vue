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
  <main class="min-h-screen overflow-y-auto">
    <div class="mx-auto max-w-4xl px-8 py-10">
      <SettingsPage @close="closeSettings" />
    </div>
  </main>
</template>
