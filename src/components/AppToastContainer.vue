<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { removeToast, toasts } = useToast()

async function copyToastMessage(message: string): Promise<void> {
  await navigator.clipboard.writeText(message)
}
</script>

<template>
  <div class="pointer-events-none fixed right-4 bottom-4 z-[90] flex w-full max-w-sm flex-col gap-3">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md"
        :class="toast.kind === 'success'
          ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
          : 'border-rose-400/25 bg-rose-500/15 text-rose-100'"
      >
        <div class="flex items-start gap-3">
          <p class="min-w-0 flex-1 text-sm leading-6">
            {{ toast.message }}
          </p>
          <div class="flex items-center gap-1">
            <button
              v-if="toast.kind === 'error'"
              type="button"
              class="rounded-lg px-2 py-1 text-xs font-medium text-current/80 transition hover:bg-white/10 hover:text-current"
              aria-label="Copy notification message"
              @click="copyToastMessage(toast.message)"
            >
              Copy
            </button>
            <button
              type="button"
              class="rounded-full p-1 text-current/70 transition hover:bg-white/10 hover:text-current"
              aria-label="Dismiss notification"
              @click="removeToast(toast.id)"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path stroke-linecap="round" d="M4 4l8 8M12 4 4 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 180ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
