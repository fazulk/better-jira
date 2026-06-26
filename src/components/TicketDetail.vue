<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useJiraTicket, ticketQueryKey } from '@/composables/useJiraTicket'
import { useLocalTicket, localTicketQueryKey } from '@/composables/useLocalTicket'
import { getCachedTickets } from '@/composables/useJiraTickets'
import { usePinnedTickets } from '@/composables/usePinnedTickets'
import { useSpaceSettings } from '@/composables/useSpaceSettings'
import { fetchTicket } from '@/api/jira'
import { fetchLocalTicket } from '@/api/localTickets'
import TicketDetailActivity from '@/components/ticket-detail/TicketDetailActivity.vue'
import TicketDetailChildren from '@/components/ticket-detail/TicketDetailChildren.vue'
import TicketDetailDescription from '@/components/ticket-detail/TicketDetailDescription.vue'
import TicketDetailHeader from '@/components/ticket-detail/TicketDetailHeader.vue'
import TicketDetailSidebar from '@/components/ticket-detail/TicketDetailSidebar.vue'
import type { JiraTicket } from '@/types/jira'
import {
  isLocalTicketKey,
} from '~/shared/localTickets'

const props = withDefaults(defineProps<{
  ticketKey: string | null
  mode?: 'inline' | 'panel'
}>(), {
  mode: 'inline',
})
const emit = defineEmits<{
  close: []
  select: [key: string]
  'navigate-view': [viewId: string]
  'create-child': [parentKey: string]
}>()

const { isPinned, togglePinnedTicket } = usePinnedTickets()
const { hasJiraCredentialsConfigured } = useSpaceSettings()
const ticketKey = computed(() => props.ticketKey)
const isLocalTicket = computed(() => isLocalTicketKey(ticketKey.value))
const jiraDataEnabled = computed(() => (
  Boolean(ticketKey.value && !isLocalTicketKey(ticketKey.value) && hasJiraCredentialsConfigured.value)
))

const ticketQuery = useJiraTicket(ticketKey, { queryEnabled: jiraDataEnabled })
const localTicketQuery = useLocalTicket(ticketKey)
const queryClient = useQueryClient()

const cachedTicket = computed<JiraTicket | null>(() => {
  const key = ticketKey.value
  if (!key) return null

  const tickets = getCachedTickets(queryClient)
  return tickets?.find((ticket) => ticket.key === key) ?? null
})

const ticket = computed(() => {
  if (isLocalTicket.value) {
    return localTicketQuery.data.value ?? cachedTicket.value
  }

  return ticketQuery.data.value ?? cachedTicket.value
})
const ticketIsPinned = computed(() => (
  ticket.value ? isPinned(ticket.value.key) : false
))

const detailQueryError = computed(() => (
  isLocalTicket.value ? localTicketQuery.isError.value : ticketQuery.isError.value
))

const issueType = computed(() => ticket.value?.issueType?.toLowerCase() || 'task')

const childTickets = computed<JiraTicket[]>(() => {
  const key = ticketKey.value
  if (!key) return []
  const allTickets = getCachedTickets(queryClient)
  if (!allTickets) return []
  return allTickets.filter((t) => t.parent?.key === key)
})

const isProjectDetail = computed(() => (
  issueType.value.includes('epic')
))
const detailBreadcrumbRoot = computed(() => (isProjectDetail.value ? 'Projects' : 'Issues'))
const detailBreadcrumbSpace = computed(() => (
  ticket.value?.spaceName || ticket.value?.spaceKey || 'Workspace'
))
const detailBreadcrumbViewId = computed(() => {
  const spaceKey = ticket.value?.spaceKey
  if (!spaceKey) return isProjectDetail.value ? 'projects' : 'my-issues'
  return isProjectDetail.value ? `team:${spaceKey}:projects` : `team:${spaceKey}:all`
})
const detailChildActionLabel = computed(() => (isProjectDetail.value ? 'Add issue' : 'Add sub-issue'))
const detailChildSectionLabel = computed(() => (isProjectDetail.value ? 'Issues' : 'Sub-issues'))
const detailEmptyChildLabel = computed(() => (isProjectDetail.value ? 'No issues linked' : 'No sub-issues'))

const imagePreview = ref<{ src: string; alt: string } | null>(null)

function openImagePreview(payload: { src: string; alt: string }): void {
  imagePreview.value = payload
}

function closeImagePreview(): void {
  imagePreview.value = null
}

onUnmounted(() => {
  document.removeEventListener('keydown', handleDetailShortcut)
})

const ticketActivityRef = ref<InstanceType<typeof TicketDetailActivity> | null>(null)
const ticketDescriptionRef = ref<InstanceType<typeof TicketDetailDescription> | null>(null)
const ticketHeaderRef = ref<InstanceType<typeof TicketDetailHeader> | null>(null)
const ticketSidebarRef = ref<InstanceType<typeof TicketDetailSidebar> | null>(null)

function prefetchTicket(key: string) {
  if (isLocalTicketKey(key)) {
    queryClient.prefetchQuery({
      queryKey: localTicketQueryKey(key),
      queryFn: () => fetchLocalTicket(key),
    })
    return
  }

  queryClient.prefetchQuery({
    queryKey: ticketQueryKey(key),
    queryFn: () => fetchTicket(key),
  })
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function handleDetailShortcut(event: KeyboardEvent): void {
  if (imagePreview.value && event.key === 'Escape') {
    event.preventDefault()
    closeImagePreview()
    return
  }

  if (!ticket.value || props.mode !== 'inline' || isEditableShortcutTarget(event.target)) {
    return
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return
  }

  if (event.key === 'Escape') {
    emit('close')
    return
  }

  const key = event.key.toLowerCase()
  if (key === 'a') {
    event.preventDefault()
    void ticketSidebarRef.value?.startEditingAssignee()
  } else if (key === 'p') {
    event.preventDefault()
    void ticketSidebarRef.value?.startEditingPriority()
  } else if (key === 'm') {
    event.preventDefault()
    void ticketSidebarRef.value?.startEditingStatus()
  } else if (key === 'c') {
    event.preventDefault()
    ticketActivityRef.value?.focusMessageComposer()
  } else if (key === 'd') {
    event.preventDefault()
    ticketDescriptionRef.value?.focusDescriptionEditor()
  } else if (key === 't') {
    event.preventDefault()
    ticketHeaderRef.value?.focusTitleInput()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleDetailShortcut)
})

</script>

<template>
  <div v-if="ticketKey && mode === 'inline'" class="min-h-full bg-issue-detail-bg lg:flex lg:h-full lg:min-h-0 lg:flex-col">
    <div v-if="ticket" class="min-h-full animate-fade-in bg-issue-detail-bg lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div class="sticky top-0 z-20 border-b border-white/[0.06] bg-issue-detail-bg backdrop-blur lg:static lg:shrink-0">
        <div class="flex min-h-12 items-center justify-between gap-4 px-6">
          <div class="flex min-w-0 items-center gap-2 text-xs text-slate-500">
            <span class="truncate">{{ detailBreadcrumbSpace }}</span>
            <span class="text-slate-700">›</span>
            <button
              type="button"
              class="shrink-0 rounded px-1 py-0.5 text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
              @click="emit('navigate-view', detailBreadcrumbViewId)"
            >
              {{ detailBreadcrumbRoot }}
            </button>
            <template v-if="ticket.parent">
              <span class="text-slate-700">›</span>
              <button
                type="button"
                class="shrink-0 rounded px-1 py-0.5 font-medium text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
                @click="$emit('select', ticket.parent.key)"
                @mouseenter="prefetchTicket(ticket.parent.key)"
              >
                {{ ticket.parent.key }}
              </button>
            </template>
            <span class="text-slate-700">›</span>
            <button
              type="button"
              class="min-w-0 truncate rounded px-1 py-0.5 text-left font-medium text-slate-300 transition hover:bg-white/[0.04] hover:text-slate-100"
              @click="$emit('select', ticket.key)"
            >
              {{ ticket.summary }}
            </button>
            <button
              type="button"
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-white/[0.04]"
              :class="ticketIsPinned ? 'text-[#d7a543] hover:text-[#d7a543]' : 'text-slate-500 hover:text-[#d7a543]'"
              :aria-label="ticketIsPinned ? `Unpin ${ticket.key}` : `Pin ${ticket.key}`"
              @click="togglePinnedTicket(ticket.key)"
            >
              <span class="text-[14px] leading-none">★</span>
            </button>
          </div>
        </div>
      </div>

      <div class="grid min-h-[calc(100vh-3rem)] grid-cols-1 bg-issue-detail-bg lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_19rem] lg:overflow-hidden">
        <main class="min-w-0 px-6 py-8 lg:overflow-y-auto lg:px-10">
          <div class="mx-auto max-w-3xl">
            <TicketDetailHeader
              ref="ticketHeaderRef"
              :child-tickets="childTickets"
              :is-project-detail="isProjectDetail"
              :ticket="ticket"
              @prefetch="prefetchTicket"
              @select="$emit('select', $event)"
            />

            <TicketDetailDescription
              ref="ticketDescriptionRef"
              :is-local-ticket="isLocalTicket"
              :ticket="ticket"
              @preview-image="openImagePreview"
            />

            <TicketDetailChildren
              :action-label="detailChildActionLabel"
              :child-tickets="childTickets"
              :empty-label="detailEmptyChildLabel"
              :section-label="detailChildSectionLabel"
              :ticket-key="ticket.key"
              @create="emit('create-child', $event)"
              @prefetch="prefetchTicket"
              @select="$emit('select', $event)"
            />

            <TicketDetailActivity
              v-if="!isLocalTicket"
              ref="ticketActivityRef"
              :query-enabled="jiraDataEnabled"
              :ticket="ticket"
              :ticket-key="ticket.key"
            />
          </div>
        </main>

        <TicketDetailSidebar
          ref="ticketSidebarRef"
          :is-local-ticket="isLocalTicket"
          :is-project-detail="isProjectDetail"
          :jira-data-enabled="jiraDataEnabled"
          :ticket="ticket"
          @prefetch="prefetchTicket"
          @select="$emit('select', $event)"
        />
      </div>
    </div>

    <div
      v-else-if="detailQueryError"
      class="flex items-center justify-center py-20 text-sm text-rose-300"
    >
      Failed to load ticket details.
    </div>

    <div v-else class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-accent-indigo"></div>
        <span class="text-xs text-slate-600">Loading ticket</span>
      </div>
    </div>

    <div
      v-if="imagePreview"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      @click="closeImagePreview"
    >
      <button
        type="button"
        class="absolute right-5 top-5 rounded-full border border-white/[0.12] bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-200 shadow-lg backdrop-blur transition hover:bg-white/[0.14] hover:text-white"
        @click.stop="closeImagePreview"
      >
        Close
      </button>
      <img
        :src="imagePreview.src"
        :alt="imagePreview.alt"
        class="h-auto w-auto rounded-lg shadow-2xl"
        style="max-width: calc(100vw - 4rem); max-height: calc(100vh - 5rem);"
        @click.stop
      >
    </div>
  </div>
</template>
