<script lang="ts">
import type { TicketListController } from '@/features/ticket-list/useTicketListController'
import { defineComponent } from 'vue'
import IssueRow from '../IssueRow.vue'

export default defineComponent({
  components: { IssueRow },
  props: ['controller'],
  setup(props: { controller: TicketListController }) {
    return props.controller
  },
})
</script>

<template>
  <div
    v-if="isReadyQaView"
    class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden"
  >
    <div class="min-w-0 overflow-y-auto">
      <div
        v-if="hiddenCompletedCount > 0 && completedRange !== 'all'"
        class="flex h-9 items-center justify-end border-b border-white/[0.06] px-4 text-[12px] text-[#777a83]"
      >
        <button type="button" class="hover:text-[#d7d8dc]" @click="completedRange = 'all'">
          {{ hiddenCompletedCount }} completed hidden by filter options
        </button>
      </div>

      <div v-if="issueSections.length && visibleIssueCount > 0">
        <section v-for="section in issueSections" :key="section.id">
          <div
            v-if="shouldShowIssueSectionHeader()"
            class="flex h-8 items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 text-[12px] font-medium text-[#aeb0b7]"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[#d7d8dc]"
              :aria-expanded="!isIssueSectionCollapsed(section)"
              @click="toggleIssueSection(section)"
            >
              <Icon
                name="lucide:chevron-down"
                class="h-3 w-3 shrink-0 text-[#777a83] transition-transform"
                :class="isIssueSectionCollapsed(section) ? '-rotate-90' : ''"
                aria-hidden="true"
              />
              <span class="truncate">{{ section.label }}</span>
              <span class="text-[#6f727b]">{{ section.tickets.length }}</span>
            </button>
          </div>
          <template v-if="!isIssueSectionCollapsed(section)">
            <IssueRow
              v-for="ticket in section.tickets"
              :key="getDisplayedIssueRowKey(ticket)"
              :ticket="ticket"
              :selected="focusedIssueKey === getDisplayedIssueRowKey(ticket)"
              :checked="checkedIssueKeySet.has(getDisplayedIssueRowKey(ticket))"
              v-bind="issueRowDisplayProps"
              @select="openTicket"
              @prefetch="prefetchTicket"
              @toggle-check="toggleCheckedIssue"
              @copy-key="copyIssueKey"
              @create-child="openChildCreate"
            />
          </template>
        </section>
      </div>

      <div v-else class="flex h-full min-h-80 items-center justify-center px-6 text-center">
        <div class="max-w-sm">
          <p class="text-[13px] font-medium text-[#d7d8dc]">
            No issues are ready for QA
          </p>
          <p class="mt-1 text-[12px] text-[#777a83]">
            Issues matching this saved view will appear here.
          </p>
        </div>
      </div>
    </div>

    <aside class="min-w-0 overflow-y-auto border-l border-white/[0.06] bg-white/[0.015]">
      <div class="border-b border-white/[0.06] px-4 py-3">
        <div class="flex items-center justify-between">
          <h2 class="text-[13px] font-medium text-[#f0f1f4]">
            Insights
          </h2>
          <span class="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-[#777a83]">Count</span>
        </div>
        <p class="mt-1 text-[12px] text-[#777a83]">
          Live summary for this saved view.
        </p>
      </div>

      <div class="grid grid-cols-3 border-b border-white/[0.06] text-center">
        <div class="border-r border-white/[0.06] px-2 py-3">
          <p class="text-[18px] font-semibold text-[#f0f1f4]">
            {{ readyQaInsightTickets.length }}
          </p>
          <p class="mt-0.5 text-[11px] text-[#777a83]">
            Issues
          </p>
        </div>
        <div class="border-r border-white/[0.06] px-2 py-3">
          <p class="text-[18px] font-semibold text-[#f0f1f4]">
            {{ readyQaUnassignedCount }}
          </p>
          <p class="mt-0.5 text-[11px] text-[#777a83]">
            Unassigned
          </p>
        </div>
        <div class="px-2 py-3">
          <p class="text-[18px] font-semibold text-[#f0f1f4]">
            {{ readyQaRecentlyUpdatedCount }}
          </p>
          <p class="mt-0.5 text-[11px] text-[#777a83]">
            Recent
          </p>
        </div>
      </div>

      <div class="space-y-5 px-4 py-4">
        <section>
          <div class="mb-2 flex items-center justify-between text-[12px]">
            <span class="font-medium text-[#d7d8dc]">By priority</span>
            <span class="text-[#6f727b]">Slice</span>
          </div>
          <div class="space-y-2">
            <div
              v-for="(slice, index) in readyQaPrioritySlices"
              :key="slice.id"
              class="space-y-1.5"
            >
              <div class="flex items-center justify-between gap-3 text-[12px]">
                <span class="truncate text-[#aeb0b7]">{{ slice.label }}</span>
                <span class="shrink-0 text-[#777a83]">{{ slice.count }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  class="h-full rounded-full"
                  :class="getInsightBarClass(index)"
                  :style="{ width: `${slice.percent}%` }"
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div class="mb-2 flex items-center justify-between text-[12px]">
            <span class="font-medium text-[#d7d8dc]">By assignee</span>
            <span class="text-[#6f727b]">Top 5</span>
          </div>
          <div class="space-y-2">
            <div
              v-for="(slice, index) in readyQaAssigneeSlices"
              :key="slice.id"
              class="space-y-1.5"
            >
              <div class="flex items-center justify-between gap-3 text-[12px]">
                <span class="truncate text-[#aeb0b7]">{{ slice.label }}</span>
                <span class="shrink-0 text-[#777a83]">{{ slice.count }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  class="h-full rounded-full"
                  :class="getInsightBarClass(index)"
                  :style="{ width: `${slice.percent}%` }"
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div class="mb-2 flex items-center justify-between text-[12px]">
            <span class="font-medium text-[#d7d8dc]">By status</span>
            <span class="text-[#6f727b]">Workflow</span>
          </div>
          <div class="space-y-2">
            <div v-for="(slice, index) in readyQaStatusSlices" :key="slice.id" class="space-y-1.5">
              <div class="flex items-center justify-between gap-3 text-[12px]">
                <span class="truncate text-[#aeb0b7]">{{ slice.label }}</span>
                <span class="shrink-0 text-[#777a83]">{{ slice.count }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  class="h-full rounded-full"
                  :class="getInsightBarClass(index)"
                  :style="{ width: `${slice.percent}%` }"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </aside>
  </div>
</template>
