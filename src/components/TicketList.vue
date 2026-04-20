<script setup lang="ts">
import { useJiraTickets } from '@/composables/useJiraTickets'
import { ticketQueryKey } from '@/composables/useJiraTicket'
import { localTicketQueryKey } from '@/composables/useLocalTicket'
import { fetchTicket } from '@/api/jira'
import { fetchLocalTicket } from '@/api/localTickets'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { isLocalTicketKey } from '~/shared/localTickets'
import Sidebar from './Sidebar.vue'
import TicketDetail from './TicketDetail.vue'
import CreateTicketModal from './CreateTicketModal.vue'
import SettingsPage from './SettingsPage.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useLocalStorage } from '@vueuse/core'
import { usePinnedTickets } from '@/composables/usePinnedTickets'
const { tickets, fetching, refreshing, refresh } = useJiraTickets()
const queryClient = useQueryClient()
const route = useRoute()
const { isPinned, togglePinnedTicket } = usePinnedTickets()
const { hasJiraCredentialsConfigured, isLoading: isLoadingSpaceSettings } = useSpaceSettings()
const sidebarCollapsed = useLocalStorage('jira2.sidebar.collapsed', false)
const defaultSidebarWidth = 288
const minSidebarWidth = 220
const maxSidebarWidth = 520
const collapsedSidebarWidth = 56
const sidebarWidth = useLocalStorage('jira2.sidebar.width', defaultSidebarWidth)
const isResizingSidebar = ref(false)
const activePointerId = ref<number | null>(null)
const isCreateModalOpen = ref(false)
const createIssueType = ref('Task')
const createParentKey = ref<string | null>(null)
const issueTypeLocked = ref(false)
const parentLocked = ref(false)
const hasFinishedInitialWorkspaceLoad = ref(false)

if (typeof sidebarWidth.value !== 'number' || Number.isNaN(sidebarWidth.value)) {
  sidebarWidth.value = defaultSidebarWidth
}

sidebarWidth.value = Math.min(maxSidebarWidth, Math.max(minSidebarWidth, sidebarWidth.value))

const effectiveSidebarWidth = computed(() => (
  sidebarCollapsed.value ? collapsedSidebarWidth : sidebarWidth.value
))

const showInitialWorkspaceOverlay = computed(() => (
  !hasFinishedInitialWorkspaceLoad.value
  && !isLoadingSpaceSettings.value
  && hasJiraCredentialsConfigured.value
  && fetching.value
))

watchEffect(() => {
  if (hasFinishedInitialWorkspaceLoad.value) {
    return
  }

  if (isLoadingSpaceSettings.value || !hasJiraCredentialsConfigured.value) {
    return
  }

  if (!fetching.value) {
    hasFinishedInitialWorkspaceLoad.value = true
  }
})

function clampSidebarWidth(nextWidth: number): number {
  return Math.min(maxSidebarWidth, Math.max(minSidebarWidth, nextWidth))
}

function updateDragState(isActive: boolean) {
  isResizingSidebar.value = isActive
  document.body.style.cursor = isActive ? 'col-resize' : ''
  document.body.style.userSelect = isActive ? 'none' : ''
}

function stopSidebarResize(pointerId?: number) {
  if (pointerId !== undefined && activePointerId.value !== pointerId) {
    return
  }

  activePointerId.value = null
  updateDragState(false)
}

function handleSidebarResize(event: PointerEvent) {
  if (!isResizingSidebar.value || sidebarCollapsed.value) {
    return
  }

  sidebarWidth.value = clampSidebarWidth(event.clientX)
}

function handleSidebarResizeEnd(event: PointerEvent) {
  stopSidebarResize(event.pointerId)
}

function startSidebarResize(event: PointerEvent) {
  if (sidebarCollapsed.value) {
    return
  }

  activePointerId.value = event.pointerId
  updateDragState(true)
  event.preventDefault()
}

watch(sidebarCollapsed, isCollapsed => {
  if (isCollapsed) {
    stopSidebarResize()
  }
})

onMounted(() => {
  window.addEventListener('pointermove', handleSidebarResize)
  window.addEventListener('pointerup', handleSidebarResizeEnd)
  window.addEventListener('pointercancel', handleSidebarResizeEnd)
})

onBeforeUnmount(() => {
  stopSidebarResize()
  window.removeEventListener('pointermove', handleSidebarResize)
  window.removeEventListener('pointerup', handleSidebarResizeEnd)
  window.removeEventListener('pointercancel', handleSidebarResizeEnd)
})

const selectedKey = computed<string | null>({
  get() {
    return typeof route.params.key === 'string' ? route.params.key : null
  },
  set(key) {
    if (key) {
      void navigateTo(`/${key}`)
      return
    }

    void navigateTo('/')
  },
})

const isSettingsRoute = computed(() => route.path === '/settings')

const selectedTicket = computed(() => (
  selectedKey.value ? tickets.value.find(ticket => ticket.key === selectedKey.value) ?? null : null
))

const selectedTicketIsPinned = computed(() => (
  selectedTicket.value ? isPinned(selectedTicket.value.key) : false
))

function prefetchTicket(ticketKey: string) {
  if (isLocalTicketKey(ticketKey)) {
    void queryClient.prefetchQuery({
      queryKey: localTicketQueryKey(ticketKey),
      queryFn: () => fetchLocalTicket(ticketKey),
    })
    return
  }

  void queryClient.prefetchQuery({
    queryKey: ticketQueryKey(ticketKey),
    queryFn: () => fetchTicket(ticketKey),
  })
}

function openTicket(ticketKey: string) {
  if (selectedKey.value === ticketKey) return
  selectedKey.value = ticketKey
}

function closeTicket() {
  if (isSettingsRoute.value) {
    void navigateTo('/')
    return
  }

  if (selectedKey.value === null) return
  selectedKey.value = null
}

function openSettings() {
  void navigateTo('/settings')
}

function closeSettings() {
  void navigateTo('/')
}

function openGlobalCreate(issueType = 'Task') {
  createIssueType.value = issueType
  createParentKey.value = null
  issueTypeLocked.value = false
  parentLocked.value = false
  isCreateModalOpen.value = true
}

function openChildCreate(parentKey: string) {
  createIssueType.value = ''
  createParentKey.value = parentKey
  issueTypeLocked.value = false
  parentLocked.value = true
  isCreateModalOpen.value = true
}

function closeCreateModal() {
  isCreateModalOpen.value = false
}

function handleTicketCreated(ticketKey: string) {
  isCreateModalOpen.value = false
  openTicket(ticketKey)
}

async function handleRefresh() {
  await refresh()
  if (selectedKey.value) {
    queryClient.invalidateQueries({
      queryKey: ticketQueryKey(selectedKey.value),
    })
  }
}
</script>

<template>
  <div class="flex h-screen overflow-hidden" :aria-busy="showInitialWorkspaceOverlay">
    <div
      class="relative shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      :style="{ width: `${effectiveSidebarWidth}px` }"
    >
      <!-- Sidebar -->
      <Sidebar
        :tickets="tickets"
        :selected-key="selectedKey"
        :collapsed="sidebarCollapsed"
        :refreshing="refreshing"
        @select="openTicket"
        @prefetch="prefetchTicket"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        @refresh="handleRefresh"
        @home="closeTicket"
        @settings="openSettings"
      />

      <button
        v-if="!sidebarCollapsed"
        type="button"
        class="absolute top-0 right-0 z-10 h-full w-2 -mr-1 cursor-col-resize touch-none bg-transparent transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-white/[0.08] hover:after:bg-indigo-400/60 focus:outline-none"
        :class="isResizingSidebar ? 'after:bg-indigo-400' : ''"
        aria-label="Resize sidebar"
        @pointerdown="startSidebarResize"
      />
    </div>

    <!-- Main content -->
    <main class="scrollbar-gutter-stable flex-1 overflow-y-auto">
      <div class="mx-auto max-w-4xl px-8 py-10">
        <div class="mb-6 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <button
              v-if="selectedTicket"
              class="inline-flex h-9 w-9 items-center justify-center overflow-visible rounded-xl border transition"
              :class="selectedTicketIsPinned
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
                : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'"
              :aria-label="selectedTicketIsPinned ? `Unpin ${selectedTicket.key}` : `Pin ${selectedTicket.key}`"
              :title="selectedTicketIsPinned ? `Unpin ${selectedTicket.key}` : `Pin ${selectedTicket.key}`"
              @click="togglePinnedTicket(selectedTicket.key)"
            >
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path transform="translate(-1 0) scale(1.08 1)" d="M15.75 3a.75.75 0 0 1 .53 1.28L15 5.56V9.5l2.78 2.78A.75.75 0 0 1 17.25 13H13.5v7.25a.75.75 0 0 1-1.5 0V13H8.25a.75.75 0 0 1-.53-1.28L10.5 9.5V5.56L9.22 4.28A.75.75 0 0 1 9.75 3h6Z" />
              </svg>
            </button>
          </div>

          <div class="flex items-center gap-3">
            <button
              class="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-indigo-400"
              @click="openGlobalCreate()"
            >
              New
            </button>
            <button
              class="flex items-center gap-2 rounded-xl glass-card px-3 py-2 text-xs font-medium text-slate-400 hover:text-white disabled:opacity-40"
              :disabled="refreshing"
              @click="handleRefresh"
            >
              <svg
                class="h-3.5 w-3.5"
                :class="{ 'animate-spin': refreshing }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {{ refreshing ? 'Syncing' : 'Refresh' }}
            </button>
          </div>
        </div>

        <div v-if="isSettingsRoute" class="animate-fade-in">
          <SettingsPage @close="closeSettings" />
        </div>

        <div v-else-if="selectedKey" class="animate-fade-in">
          <TicketDetail
            :ticket-key="selectedKey"
            mode="inline"
            @close="closeTicket"
            @select="openTicket"
            @create-child="openChildCreate"
          />
        </div>

        <div v-else class="flex min-h-[calc(100vh-9rem)] items-center justify-center">
          <div class="text-center animate-fade-in">
            <img
              src="https://emojis.slackmojis.com/emojis/images/1643514947/9701/crying-sunglasses.png?1643514947"
              alt="crying sunglasses emoji"
              class="mx-auto h-20 w-20"
            />
          </div>
        </div>
      </div>
    </main>

    <CreateTicketModal
      :open="isCreateModalOpen"
      :tickets="tickets"
      :initial-issue-type="createIssueType"
      :initial-parent-key="createParentKey"
      :issue-type-locked="issueTypeLocked"
      :parent-locked="parentLocked"
      @close="closeCreateModal"
      @created="handleTicketCreated"
    />

    <div
      v-if="showInitialWorkspaceOverlay"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/82 px-4 py-8 backdrop-blur-sm"
      aria-live="polite"
    >
      <div class="glass-card animate-slide-up w-full max-w-md rounded-[28px] border border-white/10 bg-surface-1/95 p-8 shadow-2xl shadow-black/40">
        <div class="mb-5 flex items-center justify-center">
          <div class="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-300/20 border-t-indigo-300"></div>
            <div class="absolute h-11 w-11 rounded-full border border-sky-300/10"></div>
          </div>
        </div>

        <div class="space-y-2 text-center">
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200/70">
            Jira
          </p>
          <h2 class="font-display text-2xl font-semibold text-white">
            Connecting to your workspace
          </h2>
          <p class="mx-auto max-w-sm text-sm leading-6 text-slate-400">
            Pulling your latest tickets, status changes, and saved filters before the workspace opens.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
