<script lang="ts">
import { defineComponent } from 'vue'

import type { TicketListController } from '@/features/ticket-list/useTicketListController'

export default defineComponent({
  props: ['controller'],
  setup(props: { controller: TicketListController }) {
    return props.controller
  },
})
</script>

<template>
  <div
    v-if="currentView === 'inbox'"
    class="grid min-h-0 flex-1 grid-cols-[minmax(280px,400px)_minmax(0,1fr)] overflow-hidden"
  >
    <div class="min-w-0 border-r border-white/[0.06]">
      <div
        class="flex h-9 items-center justify-between gap-2 border-b border-white/[0.06] px-3 text-[12px] text-[#777a83]"
      >
        <span>
          {{ inboxItems.length }} {{ inboxItems.length === 1 ? 'notification' : 'notifications' }}
          <span v-if="inboxUnreadCount > 0" class="text-[#aeb0b7]"
            >· {{ inboxUnreadCount }} unread</span
          >
        </span>
        <div class="flex items-center gap-1">
          <button
            v-if="inboxUnreadCount > 0"
            type="button"
            class="rounded px-1.5 py-1 hover:bg-white/[0.05] hover:text-[#d7d8dc]"
            @click="markAllInboxRead"
          >
            Mark all read
          </button>
          <button
            v-if="inboxArchivedCount > 0"
            type="button"
            class="rounded px-1.5 py-1 hover:bg-white/[0.05] hover:text-[#d7d8dc]"
            @click="restoreArchivedInboxItems"
          >
            Restore
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-1 hover:bg-white/[0.05] hover:text-[#d7d8dc]"
            @click="handleRefresh"
          >
            Refresh
          </button>
        </div>
      </div>

      <div v-if="inboxItems.length" class="h-full overflow-y-auto pb-9">
        <div
          v-for="item in inboxItems"
          :key="item.ticket.key"
          role="button"
          tabindex="0"
          class="group grid w-full grid-cols-[30px_minmax(0,1fr)_auto_auto] gap-3 border-b border-white/[0.045] px-3 py-3 text-left transition hover:bg-white/[0.035]"
          :class="activeInboxItem?.ticket.key === item.ticket.key ? 'bg-white/[0.055]' : ''"
          @mouseenter="prefetchTicket(item.ticket.key)"
          @click="selectInboxItem(item.ticket.key)"
          @keydown.enter.prevent="selectInboxItem(item.ticket.key)"
          @keydown.space.prevent="selectInboxItem(item.ticket.key)"
        >
          <span
            class="relative flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.045] text-[10px] font-semibold text-[#c8cad0]"
          >
            {{ item.actorInitials }}
            <span
              v-if="item.unread"
              class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#6f73ff]"
            ></span>
          </span>

          <span class="min-w-0">
            <span class="flex min-w-0 items-center gap-2">
              <span class="truncate text-[13px] font-medium text-[#e6e7ea]">{{
                item.summary
              }}</span>
            </span>
            <span class="mt-1 block truncate text-[12px] text-[#8f9198]">{{ item.excerpt }}</span>
            <span class="mt-1.5 flex items-center gap-2 text-[11px] text-[#6f727b]">
              <span>{{ item.actorName }}</span>
              <span>·</span>
              <span>{{ item.ticket.spaceKey }}</span>
            </span>
          </span>

          <span class="whitespace-nowrap pt-0.5 text-[11px] text-[#6f727b]">{{
            item.relativeTime
          }}</span>
          <span class="flex items-start pt-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              class="rounded px-1.5 py-0.5 text-[11px] text-[#8f9198] hover:bg-white/[0.06] hover:text-[#d7d8dc]"
              title="Archive"
              @click.stop="archiveInboxItem(item.ticket.key)"
            >
              E
            </button>
          </span>
        </div>
      </div>

      <div v-else class="flex h-full min-h-80 items-center justify-center px-8 text-center">
        <div class="max-w-sm">
          <p class="text-[13px] font-medium text-[#d7d8dc]">Inbox is clear</p>
          <p class="mt-1 text-[12px] text-[#777a83]">Backlog issues will appear here.</p>
        </div>
      </div>
    </div>

    <div class="min-w-0 overflow-y-auto">
      <div v-if="activeInboxItem" class="mx-auto max-w-3xl px-8 py-10">
        <div class="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-[12px] text-[#777a83]">
              <span>{{ activeInboxItem.ticket.spaceName }}</span>
              <span>·</span>
              <span>{{ activeInboxItem.ticket.key }}</span>
              <span>·</span>
              <span>{{ activeInboxItem.relativeTime }}</span>
            </div>
            <h2 class="mt-2 text-[20px] font-semibold leading-snug text-[#f0f1f4]">
              {{ activeInboxItem.ticket.summary }}
            </h2>
          </div>

          <button
            type="button"
            class="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-[12px] text-[#d7d8dc] hover:bg-white/[0.06] hover:text-[#f0f1f4]"
            @click="openActiveInboxIssue"
          >
            Open issue
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2 border-b border-white/[0.06] py-3">
          <button
            type="button"
            class="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[12px] text-[#aeb0b7] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
            @click="toggleActiveInboxRead"
          >
            {{ activeInboxItem.unread ? 'Mark read' : 'Mark unread' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[12px] text-[#aeb0b7] hover:bg-white/[0.05] hover:text-[#f0f1f4]"
            @click="archiveActiveInboxItem"
          >
            Archive
          </button>
        </div>

        <div class="grid gap-3 border-b border-white/[0.06] py-5 text-[13px]">
          <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
            <span class="text-[#777a83]">Status</span>
            <span class="text-[#d7d8dc]">{{ activeInboxItem.ticket.status }}</span>
          </div>
          <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
            <span class="text-[#777a83]">Priority</span>
            <span class="text-[#d7d8dc]">{{
              activeInboxItem.ticket.priority || 'No priority'
            }}</span>
          </div>
          <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
            <span class="text-[#777a83]">Assignee</span>
            <span class="text-[#d7d8dc]">{{
              activeInboxItem.ticket.assignee || 'Unassigned'
            }}</span>
          </div>
          <div v-if="activeInboxProjectParent" class="grid grid-cols-[110px_minmax(0,1fr)] gap-4">
            <span class="text-[#777a83]">Project</span>
            <span class="min-w-0 truncate text-[#d7d8dc]">
              {{ activeInboxProjectParent.summary }}
            </span>
          </div>
          <div
            v-else-if="activeInboxIssueParent"
            class="grid grid-cols-[110px_minmax(0,1fr)] gap-4"
          >
            <span class="text-[#777a83]">Parent</span>
            <span class="min-w-0 truncate text-[#d7d8dc]">
              {{ activeInboxIssueParent.key }} · {{ activeInboxIssueParent.summary }}
            </span>
          </div>
        </div>

        <div class="py-5">
          <h3 class="text-[13px] font-medium text-[#f0f1f4]">{{ activeInboxItem.summary }}</h3>
          <p class="mt-2 text-[13px] leading-6 text-[#aeb0b7]">{{ activeInboxItem.excerpt }}</p>
        </div>
      </div>

      <div v-else class="flex h-full min-h-80 items-center justify-center px-8 text-center">
        <p class="text-[13px] text-[#777a83]">Select a notification to preview it.</p>
      </div>
    </div>
  </div>
</template>
